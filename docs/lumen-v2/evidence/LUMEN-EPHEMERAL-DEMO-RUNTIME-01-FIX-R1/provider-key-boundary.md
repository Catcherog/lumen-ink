# Provider Key Boundary Evidence

`EphemeralProviderSettings.test.tsx` verifies:

1. OpenAI with an existing key → switch to Gemini → the local key is empty and
   Save commits only the Gemini draft with an empty key.
2. Open the dialog → change Provider and key → Cancel → parent `onChange` is
   never called.
3. Switching Provider and entering a new key → Save commits only the new
   Provider/model/key tuple.

`useEditor.test.ts` and `routes/edit.ephemeral.test.ts` verify the request body
contains only the current request-scoped provider and that the API response
does not contain the key. Persistent routes reject a BYO provider body.
