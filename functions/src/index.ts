import * as dotenv from "dotenv";
dotenv.config(); // ← FIRST, before everything else

import * as functions from "firebase-functions";
import app from "./app";

export const taskflowApi = functions.https.onRequest(app);
