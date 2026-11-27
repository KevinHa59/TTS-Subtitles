import { Paper } from "@mui/material";
import React from "react";

export default function HealthStatus({ API, healthOk, healthText }) {
  return (
    <Paper sx={{ padding: 1 }}>
      <strong>API:</strong> <code>{API}</code> —{" "}
      <span
        style={{
          color:
            healthOk === false ? "crimson" : healthOk ? "seagreen" : "inherit",
        }}
      >
        {healthText}
      </span>
    </Paper>
  );
}
