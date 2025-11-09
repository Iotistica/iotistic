"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserSuspended = exports.VerifyEmail = void 0;
exports.VerifyEmail = {
    subject: 'Please verify your email address',
    text: `Hello, {{safeName.text}},

Please use this code to verify your email address:

{{token.token}}

Do not share this code with anyone else.

This token will expire in 30 minutes.
`,
    html: `<p>Hello, <b>{{safeName.html}}</b>,</p>
<p>Please use this code to verify your email address:</p>
<p><b>{{token.token}}</b></p>
<p>Do not share this code with anyone else.</p>
<p>This token will expire in 30 minutes.</p>
`
};
exports.UserSuspended = {
    subject: 'Account Suspended',
    text: `Hello, {{safeName.text}},

Your account has been suspended.

Please contact support for more information.
`,
    html: `<p>Hello, <b>{{safeName.html}}</b>,</p>
<p>Your account has been suspended.</p>
<p>Please contact support for more information.</p>
`
};
//# sourceMappingURL=index.js.map