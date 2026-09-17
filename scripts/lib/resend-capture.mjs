// A stand-in for the `resend` package that files the message instead of sending it. Same shape the app uses
// (`new Resend(key).emails.send({ from, to, subject, html })` → `{ data, error }`), so the sender functions run
// unchanged and still report success.
export const SENT = [];

export class Resend {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.emails = {
            send: async (message) => {
                SENT.push(message);
                return { data: { id: `preview-${SENT.length}` }, error: null };
            },
        };
    }
}

export default { Resend };
