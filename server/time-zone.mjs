const validZones=new Set();
const invalid=()=>{throw Object.assign(new Error('Choose a valid IANA time zone, such as Asia/Kolkata'),{status:400});};

export function ianaTimeZone(value){
 if(typeof value!=='string'||value.length>80||!value.trim())invalid();
 const zone=/^utc$/i.test(value.trim())?'UTC':value.trim();
 // A numeric offset is not an origin zone: it cannot retain daylight-saving rules.
 if(!/^[A-Za-z][A-Za-z0-9_+.-]*(?:\/[A-Za-z0-9_+.-]+)*$/.test(zone))invalid();
 if(validZones.has(zone))return zone;
 try{new Intl.DateTimeFormat('en',{timeZone:zone});}catch{invalid();}
 if(validZones.size>=64)validZones.delete(validZones.values().next().value);
 validZones.add(zone);return zone;
}

// Older clients and historic events have unknown origin zones. Never substitute
// the worker's, server's, export's or current reader's zone for that missing fact.
export function sourceTimeZone(value){return value===undefined||value===null?null:ianaTimeZone(value);}
