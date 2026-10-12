import { fileURLToPath } from "node:url";
import { createApp } from "./app";

const port = Number(process.env.PORT ?? 3000);
const staticDir = fileURLToPath(new URL("../dist/web", import.meta.url));

const app = createApp({ staticDir });
app.http.listen(port, () => {
  console.log(`boxmate listening on http://localhost:${port}`);
});
