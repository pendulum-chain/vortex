import express from "express";
import itemRoutes from "./items.route";
import routes from "./v1";

const app = express();

app.get("env");
app.use(["/legacy", "/old"], itemRoutes);
app.use("/v1", routes);

export default app;
