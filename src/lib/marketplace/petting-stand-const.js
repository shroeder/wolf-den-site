// The stand's id, split out from petting-stand.js because that module is `server-only` (it reaches the DB) and
// the farm client needs to recognise the decoration to open the right panel for it. One constant, one home —
// a literal "deco_petting_stand" typed into the client is the kind of thing that survives a rename.
export const STAND_DECO_ID = "deco_petting_stand";
export const STAND_SLOTS = 3;
