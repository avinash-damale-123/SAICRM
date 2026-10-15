import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { smtpConfiguration, smtpOptions, createMailer } from '../server/email.mjs';
import { configuration } from '../server/api.mjs';

const env = {
 DATABASE_URL:'postgres://test-only', APP_ORIGIN:'https://crm.example.org', TOKEN_SECRET:'a'.repeat(64),
 SMTP_HOST:'smtp.gmail.com',SMTP_PORT:'587',SMTP_USER:'noreply@satguruai.com',
 SMTP_PASSWORD:'test only app pass',EMAIL_FROM:'SCRM <noreply@satguruai.com>'
};
test('SMTP configuration works without a Resend key and requires all SMTP settings',()=>{
 const config=configuration(env);
 assert.equal(config.smtp.host,'smtp.gmail.com');
 assert.equal(config.smtp.password,'testonlyapppass');
 assert.equal('emailKey' in config,false);
 for(const key of ['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASSWORD','EMAIL_FROM']){
  assert.throws(()=>configuration({...env,[key]:''}),/SMTP/);
 }
 assert.throws(()=>configuration({...env,SMTP_PORT:'25'}),/SMTP/);
 assert.throws(()=>configuration({...env,SMTP_HOST:'smtp://user:password@host'}),/SMTP/);
 assert.throws(()=>configuration({...env,EMAIL_FROM:'sender@example.org\r\nBcc:other@example.org'}),/SMTP/);
});
test('SMTP options require verified TLS on 587 and implicit TLS on 465; logs remain off',()=>{
 const starttls=smtpOptions(smtpConfiguration(env));
 assert.equal(starttls.secure,false);
 assert.equal(starttls.requireTLS,true);
 assert.equal(starttls.tls.rejectUnauthorized,true);
 assert.equal(starttls.tls.minVersion,'TLSv1.2');
 assert.equal(starttls.logger,false);
 assert.equal(starttls.debug,false);
 const implicit=smtpOptions(smtpConfiguration({...env,SMTP_PORT:'465'}));
 assert.equal(implicit.secure,true);
});
test('mailer sends exactly one recipient and a real text body via the configured sender',async()=>{
 let sent,options;
 const deliver=createMailer(smtpConfiguration(env),value=>{
  options=value;
  return {sendMail:async message=>{sent=message;return {accepted:['employee@example.org'],rejected:[]}}};
 });
 await deliver({to:'employee@example.org',subject:'Verify email',text:'Your generated verification code is 123456'});
 assert.equal(options.host,'smtp.gmail.com');
 assert.equal(sent.from,'SCRM <noreply@satguruai.com>');
 assert.deepEqual(sent.to,[{address:'employee@example.org'}]);
 assert.equal(sent.text,'Your generated verification code is 123456');
 assert.equal('html' in sent,false);
});
test('SMTP errors and recipient rejection never expose raw credentials or verification contents',async()=>{
 const config=smtpConfiguration(env);
 const deliver=createMailer(config,()=>({sendMail:async()=>{throw Error('Provider error includes '+config.smtp.password+' and verification code 123456')}}));
 await assert.rejects(deliver({to:'employee@example.org',subject:'Verification',text:'123456'}),error=>{
  assert.equal(error.code,'EMAIL_DELIVERY_FAILED');
  assert.equal(error.message.includes(config.smtp.password),false);
  assert.equal(error.message.includes('123456'),false);
  assert.equal(error.cause,undefined);
  return true;
 });
 const rejected=createMailer(config,()=>({sendMail:async()=>({accepted:[],rejected:['employee@example.org']})}));
 await assert.rejects(rejected({to:'employee@example.org',subject:'Verification',text:'123456'}),/Email delivery failed/);
});
test('real SMTP connection refuses a server without STARTTLS before transmitting credentials',async()=>{
 const commands=[];
 const sockets=new Set();
 const server=net.createServer(socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));
  socket.setEncoding('utf8');socket.write('220 local-test ESMTP\r\n');
  let pending='';
  socket.on('data',data=>{
   pending+=data;
   while(pending.includes('\r\n')){
    const end=pending.indexOf('\r\n'),line=pending.slice(0,end);pending=pending.slice(end+2);
    commands.push(line);
    if(line.startsWith('EHLO'))socket.write('250-local-test\r\n250 AUTH PLAIN LOGIN\r\n');
    else if(line==='STARTTLS')socket.write('500 TLS unavailable\r\n');
    else socket.write('500 Command not accepted\r\n');
   }
  });
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  // Use the production options with a temporary local test listener.
  // requireTLS remains true; this fixture never receives an AUTH command.
  const config=smtpConfiguration(env);
  config.smtp.host='127.0.0.1';config.smtp.port=server.address().port;
  await assert.rejects(createMailer(config)({to:'employee@example.org',subject:'Verification',text:'123456'}),/Email delivery failed/);
  assert.ok(commands.some(command=>command==='STARTTLS'));
  assert.equal(commands.some(command=>command.startsWith('AUTH')),false);
 }finally{
  for(const socket of sockets)socket.destroy();
  await new Promise(resolve=>server.close(resolve));
 }
});
