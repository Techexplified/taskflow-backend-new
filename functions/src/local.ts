// src/local.ts — local dev server only (`npm run dev`). Not used on Firebase.
import "dotenv/config"; // must load before ./config/env validates process.env
import app from "./app";
import { connectToDatabase } from "./config/db";
import { createUserIndexes } from "./models/users";
import { env } from "./config/env";

connectToDatabase()
  .then(() => createUserIndexes())
  .then(() => {
    app.listen(Number(env.PORT), () =>
      console.log(`TaskFlow API on http://localhost:${env.PORT}`),
    );
  })
  .catch((err) => {
    console.error("Startup failed", err);
    process.exit(1);
  });
