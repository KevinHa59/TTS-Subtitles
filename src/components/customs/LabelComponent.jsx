import { Divider, Paper, Stack, Typography } from "@mui/material";
import React from "react";

export default function LabelComponent({ label, children, sx = {} }) {
  return (
    <Paper
      sx={(theme) => {
        return {
          width: "100%",
          borderRadius: "25px",
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          background: theme.palette.background.default,
        };
      }}
    >
      <Typography
        variant="caption"
        sx={(theme) => {
          return {
            fontWeight: "bold",
            paddingX: 1,
            color: theme.palette.text.secondary,
          };
        }}
      >
        {label}
      </Typography>
      <Divider orientation="vertical" flexItem />
      <Stack
        direction={"row"}
        sx={{
          flex: 1,
          justifyContent: "flex-end",
          alignItems: "center",
          ...sx,
        }}
      >
        {children}
      </Stack>
    </Paper>
  );
}
