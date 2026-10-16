// Pure contracts for the future API. Authentication must supply the principal;
// never construct a principal from request JSON, employee records or browser storage.
export const fields = {
  "leads": [
    [
      "name",
      "Lead / Organisation",
      "text",
      1
    ],
    [
      "type",
      "Lead Type",
      "select",
      1,
      [
        "Corporate",
        "SME",
        "NGO",
        "Ministry",
        "Government Organisation",
        "Non-IATA",
        "Retail",
        "Other"
      ]
    ],
    [
      "contact",
      "Contact Person",
      "text"
    ],
    [
      "email",
      "Email",
      "email"
    ],
    [
      "branch",
      "Branch",
      "select",
      1,
      [
        "Pune",
        "Dubai",
        "Nairobi",
        "Mumbai",
        "Other"
      ]
    ],
    [
      "status",
      "Lead Status",
      "select",
      1,
      [
        "New",
        "Cold",
        "Warm",
        "In Process",
        "Proposal Submitted",
        "Negotiation",
        "Converted",
        "Dead/Disqualified"
      ]
    ],
    [
      "value",
      "Estimated Value (USD)",
      "number"
    ],
    [
      "scopeBranch",
      "Access branch code",
      "text",
      1
    ],
    [
      "scopeLine",
      "Access business line",
      "select",
      1,
      [
        "STTS",
        "CAR",
        "T3",
        "GSA"
      ]
    ]
  ],
  "customers": [
    [
      "name",
      "Customer Name",
      "text",
      1
    ],
    [
      "identity",
      "Identity Type",
      "select",
      1,
      [
        "Individual",
        "Organisation"
      ]
    ],
    [
      "category",
      "Business-Line Category",
      "select",
      1,
      [
        "Corporate",
        "Retail",
        "Non-IATA",
        "Other"
      ]
    ],
    [
      "line",
      "Business Line",
      "select",
      1,
      [
        "STTS",
        "CAR",
        "T3",
        "GSA"
      ]
    ],
    [
      "branch",
      "Branch",
      "text"
    ],
    [
      "country",
      "Country",
      "text"
    ],
    [
      "status",
      "Status",
      "select",
      1,
      [
        "Active",
        "Inactive"
      ]
    ],
    [
      "scopeBranch",
      "Access branch code",
      "text",
      1
    ],
    [
      "scopeLine",
      "Access business line",
      "select",
      1,
      [
        "STTS",
        "CAR",
        "T3",
        "GSA"
      ]
    ]
  ],
  "contacts": [
    [
      "name",
      "Full Name",
      "text",
      1
    ],
    [
      "organisation",
      "Organisation",
      "text"
    ],
    [
      "title",
      "Position / Relationship",
      "text"
    ],
    [
      "email",
      "Email",
      "email"
    ],
    [
      "phone",
      "Phone",
      "text"
    ],
    [
      "status",
      "Status",
      "select",
      1,
      [
        "Active",
        "Inactive"
      ]
    ],
    [
      "scopeBranch",
      "Access branch code",
      "text",
      1
    ],
    [
      "scopeLine",
      "Access business line",
      "select",
      1,
      [
        "STTS",
        "CAR",
        "T3",
        "GSA"
      ]
    ]
  ],
  "opportunities": [
    [
      "name",
      "Opportunity",
      "text",
      1
    ],
    [
      "customer",
      "Customer",
      "text",
      1
    ],
    [
      "stage",
      "Stage",
      "select",
      1,
      [
        "Qualification",
        "Discovery",
        "Proposal",
        "Negotiation",
        "Closed Won",
        "Closed Lost"
      ]
    ],
    [
      "value",
      "Value (USD)",
      "number"
    ],
    [
      "probability",
      "Probability %",
      "number"
    ],
    [
      "close",
      "Expected Close",
      "date"
    ],
    [
      "scopeBranch",
      "Access branch code",
      "text",
      1
    ],
    [
      "scopeLine",
      "Access business line",
      "select",
      1,
      [
        "STTS",
        "CAR",
        "T3",
        "GSA"
      ]
    ]
  ],
  "activities": [
    [
      "subject",
      "Subject",
      "text",
      1
    ],
    [
      "type",
      "Activity Type",
      "select",
      1,
      [
        "Task",
        "Call",
        "Meeting",
        "Email",
        "Note"
      ]
    ],
    [
      "related",
      "Related Record",
      "text"
    ],
    [
      "due",
      "Due Date",
      "date"
    ],
    [
      "status",
      "Status",
      "select",
      1,
      [
        "Planned",
        "In Progress",
        "Completed",
        "Cancelled"
      ]
    ],
    [
      "owner",
      "Owner",
      "text"
    ],
    [
      "scopeBranch",
      "Access branch code",
      "text",
      1
    ],
    [
      "scopeLine",
      "Access business line",
      "select",
      1,
      [
        "STTS",
        "CAR",
        "T3",
        "GSA"
      ]
    ]
  ],
  "quotes": [
    [
      "name",
      "Quotation Name",
      "text",
      1
    ],
    [
      "customer",
      "Customer",
      "text",
      1
    ],
    [
      "service",
      "Service",
      "select",
      1,
      [
        "Air",
        "Hotel",
        "Visa",
        "Car",
        "Packages/MICE",
        "Insurance",
        "Other"
      ]
    ],
    [
      "amount",
      "Amount (USD)",
      "number"
    ],
    [
      "status",
      "Status",
      "select",
      1,
      [
        "Draft",
        "Submitted",
        "Approved",
        "Rejected"
      ]
    ],
    [
      "valid",
      "Valid Until",
      "date"
    ],
    [
      "scopeBranch",
      "Access branch code",
      "text",
      1
    ],
    [
      "scopeLine",
      "Access business line",
      "select",
      1,
      [
        "STTS",
        "CAR",
        "T3",
        "GSA"
      ]
    ]
  ],
  "bookings": [
    [
      "name",
      "Booking Name",
      "text",
      1
    ],
    [
      "customer",
      "Customer",
      "text",
      1
    ],
    [
      "service",
      "Service",
      "select",
      1,
      [
        "Air",
        "Hotel",
        "Visa",
        "Car",
        "Packages/MICE",
        "Insurance",
        "Other"
      ]
    ],
    [
      "amount",
      "Amount (USD)",
      "number"
    ],
    [
      "status",
      "Status",
      "select",
      1,
      [
        "Pending",
        "Confirmed",
        "Cancelled"
      ]
    ],
    [
      "date",
      "Booking Date",
      "date"
    ],
    [
      "scopeBranch",
      "Access branch code",
      "text",
      1
    ],
    [
      "scopeLine",
      "Access business line",
      "select",
      1,
      [
        "STTS",
        "CAR",
        "T3",
        "GSA"
      ]
    ]
  ],
  "employees": [
    [
      "name",
      "Employee Name",
      "text",
      1
    ],
    [
      "email",
      "Work Email",
      "email",
      1
    ],
    [
      "department",
      "Department",
      "text"
    ],
    [
      "branch",
      "Branch",
      "text"
    ],
    [
      "role",
      "Role",
      "text"
    ],
    [
      "status",
      "Status",
      "select",
      1,
      [
        "Pending Approval",
        "Active",
        "Deactivated"
      ]
    ]
  ],
  "branches": [
    [
      "name",
      "Branch Name",
      "text",
      1
    ],
    [
      "country",
      "Country",
      "text",
      1
    ],
    [
      "lines",
      "Business Lines",
      "text"
    ],
    [
      "status",
      "Status",
      "select",
      1,
      [
        "Active",
        "Inactive"
      ]
    ]
  ]
};
export const modules = Object.freeze(Object.keys(fields));
const privileged = new Set(['employees', 'branches']);
export function authorize(principal, action, module) {
  if (!principal || !principal.emailVerified || principal.status !== 'approved') return false;
  if (!['admin', 'manager', 'member', 'viewer'].includes(principal.role)) return false;
  if (module === 'audit') return principal.role === 'admin' && action === 'read';
  if (module === 'access') return principal.role === 'admin' && ['read', 'approve', 'reject', 'suspend', 'role'].includes(action);
  if (!modules.includes(module) || !['read', 'create', 'update', 'delete'].includes(action)) return false;
  if (privileged.has(module)) return principal.role === 'admin';
  if (action === 'read') return true;
  if (action === 'delete') return ['admin', 'manager'].includes(principal.role);
  return principal.role !== 'viewer';
}
export function validateRecord(module, input) {
  const schema = fields[module];
  if (!schema) throw new Error('Unknown module');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected record object');
  const allowed = new Set(schema.map(([key]) => key));
  if (Object.keys(input).some(key => !allowed.has(key))) throw new Error('Unknown or server-managed field');
  const output = {};
  for (const [key, label, type, required, choices] of schema) {
    const value = input[key];
    if (value === undefined || value === '') {
      if (required) throw new Error(label + ' is required');
      output[key] = type === 'number' ? 0 : '';
      continue;
    }
    if (type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e12) throw new Error('Invalid ' + label);
      if (key === 'probability' && value > 100) throw new Error('Probability must be at most 100');
      output[key] = value;
      continue;
    }
    if (typeof value !== 'string') throw new Error('Invalid ' + label);
    const clean = value.trim();
    if ((required && !clean) || clean.length > (key === 'email' ? 254 : 500) || /[\u0000-\u001f\u007f]/u.test(clean)) throw new Error('Invalid ' + label);
    if(key==='scopeBranch' && !/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(clean)) throw new Error('Branch access code must use uppercase letters, digits, underscores or hyphens');
    if (type === 'select' && !choices.includes(clean)) throw new Error('Invalid ' + label);
    if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(clean)) throw new Error('Invalid email');
    if (type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/u.test(clean) || !Number.isFinite(Date.parse(clean)) || new Date(clean).toISOString().slice(0, 10) !== clean)) throw new Error('Invalid date');
    output[key] = clean;
  }
  return output;
}
