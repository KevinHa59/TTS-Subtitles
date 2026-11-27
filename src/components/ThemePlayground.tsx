import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  AppBar,
  Autocomplete,
  Avatar,
  Badge,
  Box,
  Button,
  ButtonGroup,
  Card,
  CardActions,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  CssBaseline,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  InputLabel,
  LinearProgress,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  MenuItem,
  Pagination,
  Paper,
  Radio,
  RadioGroup,
  Rating,
  Select,
  Slider,
  Snackbar,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";

import {
  ThemeProvider,
  createTheme,
  type ThemeOptions,
} from "@mui/material/styles";

/* -------------------------------------------------------------------------- */
/*  Config                                                                    */
/* -------------------------------------------------------------------------- */

type ThemeMode = "light" | "dark";

interface ThemeConfig {
  mode: ThemeMode;

  primary: string;
  secondary: string;
  error: string;
  warning: string;
  info: string;
  success: string;

  bgDefault: string;
  bgPaper: string;

  fontFamily: string;
  fontSize: number;

  radius: number;
  spacing: number;

  uppercaseButtons: boolean;
  flatSurfaces: boolean;
  disableButtonElevation: boolean;
}

const LIGHT_BG = { bgDefault: "#f8fafc", bgPaper: "#ffffff" };
const DARK_BG = { bgDefault: "#020617", bgPaper: "#0f172a" };

const DEFAULT_CONFIG: ThemeConfig = {
  mode: "dark",

  primary: "#8b5cf6",
  secondary: "#06b6d4",
  error: "#ef4444",
  warning: "#f59e0b",
  info: "#3b82f6",
  success: "#22c55e",

  ...DARK_BG,

  fontFamily: "IBM Plex Sans",
  fontSize: 14,

  radius: 8,
  spacing: 8,

  uppercaseButtons: false,
  flatSurfaces: true,
  disableButtonElevation: true,
};

const FONT_OPTIONS = [
  "IBM Plex Sans",
  "Inter",
  "Roboto",
  "Poppins",
  "DM Sans",
  "Nunito",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Source Sans 3",
  "Space Grotesk",
  "JetBrains Mono",
];

/* -------------------------------------------------------------------------- */
/*  Theme builder + code generator                                            */
/*  (cùng 1 hàm cho preview và code export => luôn khớp 100%)                 */
/* -------------------------------------------------------------------------- */

function buildThemeOptions(c: ThemeConfig): ThemeOptions {
  const border =
    c.mode === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";

  const components: NonNullable<ThemeOptions["components"]> = {
    MuiButton: {
      defaultProps: { disableElevation: c.disableButtonElevation },
    },
  };

  if (c.flatSurfaces) {
    components.MuiPaper = {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { border: `1px solid ${border}` } },
    };
  }

  return {
    palette: {
      mode: c.mode,
      primary: { main: c.primary },
      secondary: { main: c.secondary },
      error: { main: c.error },
      warning: { main: c.warning },
      info: { main: c.info },
      success: { main: c.success },
      background: { default: c.bgDefault, paper: c.bgPaper },
    },
    shape: { borderRadius: c.radius },
    spacing: c.spacing,
    typography: {
      fontFamily: `'${c.fontFamily}', Helvetica, Arial, sans-serif`,
      fontSize: c.fontSize,
      button: { textTransform: c.uppercaseButtons ? "uppercase" : "none" },
    },
    components,
  };
}

function generateThemeCode(options: ThemeOptions): string {
  const body = JSON.stringify(options, null, 2).replace(
    /"([A-Za-z_$][\w$]*)":/g,
    "$1:",
  );

  return `import { createTheme } from "@mui/material/styles";

const theme = createTheme(${body});

export default theme;
`;
}

/* -------------------------------------------------------------------------- */
/*  Small helpers                                                             */
/* -------------------------------------------------------------------------- */

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  const valid = HEX_RE.test(draft);

  return (
    <TextField
      size="small"
      fullWidth
      label={label}
      value={draft}
      error={!valid}
      onChange={(e) => {
        setDraft(e.target.value);
        if (HEX_RE.test(e.target.value)) onChange(e.target.value);
      }}
      slotProps={{
        input: {
          startAdornment: (
            <Box
              component="input"
              type="color"
              value={valid && draft.length === 7 ? draft : value}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onChange(e.target.value)
              }
              sx={{
                width: 28,
                height: 28,
                p: 0,
                mr: 1,
                border: 0,
                bgcolor: "transparent",
                cursor: "pointer",
              }}
            />
          ),
        },
      }}
    />
  );
}

function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Box>
      <Typography
        variant="overline"
        color="text.secondary"
        sx={{ display: "block", mb: 1 }}
      >
        {title}
      </Typography>

      <Stack spacing={2}>{children}</Stack>
    </Box>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between">
        <Typography variant="body2">{label}</Typography>

        <Typography variant="body2" color="text.secondary">
          {value}
          {unit}
        </Typography>
      </Stack>

      <Slider
        size="small"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(_, v) => onChange(v as number)}
      />
    </Box>
  );
}

function PreviewSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>

      <Divider sx={{ mb: 2 }} />

      {children}
    </Paper>
  );
}

const COLORS = [
  "primary",
  "secondary",
  "error",
  "warning",
  "info",
  "success",
] as const;

/* -------------------------------------------------------------------------- */
/*  Component showcase (nằm trong ThemeProvider của theme đang chỉnh)         */
/* -------------------------------------------------------------------------- */

function ComponentShowcase() {
  const [tab, setTab] = useState(0);
  const [toggle, setToggle] = useState("left");
  const [sliderValue, setSliderValue] = useState(40);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [snackOpen, setSnackOpen] = useState(false);

  return (
    <Stack spacing={3}>
      {/* TYPOGRAPHY */}
      <PreviewSection title="Typography">
        <Stack spacing={0.5}>
          <Typography variant="h3">Heading 3</Typography>
          <Typography variant="h4">Heading 4</Typography>
          <Typography variant="h5">Heading 5</Typography>
          <Typography variant="h6">Heading 6</Typography>
          <Typography variant="subtitle1">Subtitle 1</Typography>
          <Typography variant="subtitle2">Subtitle 2</Typography>
          <Typography variant="body1">
            Body 1 – The quick brown fox jumps over the lazy dog.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Body 2 – The quick brown fox jumps over the lazy dog.
          </Typography>
          <Typography variant="caption">Caption text</Typography>
          <Typography variant="overline">Overline text</Typography>
        </Stack>
      </PreviewSection>

      {/* BUTTONS */}
      <PreviewSection title="Buttons">
        <Stack spacing={2}>
          {(["contained", "outlined", "text"] as const).map((variant) => (
            <Stack
              key={variant}
              direction="row"
              spacing={1}
              flexWrap="wrap"
              useFlexGap
            >
              {COLORS.map((color) => (
                <Button key={color} variant={variant} color={color}>
                  {color}
                </Button>
              ))}
            </Stack>
          ))}

          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="contained" size="small">
              Small
            </Button>
            <Button variant="contained" size="medium">
              Medium
            </Button>
            <Button variant="contained" size="large">
              Large
            </Button>
            <Button variant="contained" disabled>
              Disabled
            </Button>
          </Stack>

          <Stack direction="row" spacing={2} alignItems="center">
            <ButtonGroup variant="outlined">
              <Button>One</Button>
              <Button>Two</Button>
              <Button>Three</Button>
            </ButtonGroup>

            <ToggleButtonGroup
              exclusive
              size="small"
              value={toggle}
              onChange={(_, v) => v && setToggle(v)}
            >
              <ToggleButton value="left">Left</ToggleButton>
              <ToggleButton value="center">Center</ToggleButton>
              <ToggleButton value="right">Right</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </Stack>
      </PreviewSection>

      {/* INPUTS */}
      <PreviewSection title="Inputs">
        <Stack spacing={3}>
          <Stack direction="row" spacing={2}>
            <TextField fullWidth label="Outlined" variant="outlined" />
            <TextField fullWidth label="Filled" variant="filled" />
            <TextField fullWidth label="Standard" variant="standard" />
          </Stack>

          <Stack direction="row" spacing={2}>
            <TextField
              fullWidth
              error
              label="Error"
              defaultValue="Invalid value"
              helperText="Something went wrong"
            />

            <TextField
              fullWidth
              label="With helper"
              helperText="Some important text"
            />

            <FormControl fullWidth>
              <InputLabel id="demo-select">Select</InputLabel>

              <Select labelId="demo-select" label="Select" defaultValue={10}>
                <MenuItem value={10}>Ten</MenuItem>
                <MenuItem value={20}>Twenty</MenuItem>
                <MenuItem value={30}>Thirty</MenuItem>
              </Select>
            </FormControl>
          </Stack>

          <Autocomplete
            options={FONT_OPTIONS}
            renderInput={(params) => (
              <TextField {...params} label="Autocomplete" />
            )}
          />

          <TextField multiline minRows={3} label="Multiline" fullWidth />

          <Stack direction="row" spacing={4} flexWrap="wrap" useFlexGap>
            <Box>
              <FormLabel>Checkbox</FormLabel>
              <Stack direction="row">
                <Checkbox defaultChecked />
                <Checkbox />
                <Checkbox defaultChecked color="secondary" />
                <Checkbox disabled />
              </Stack>
            </Box>

            <Box>
              <FormLabel>Radio</FormLabel>
              <RadioGroup row defaultValue="a">
                <FormControlLabel value="a" control={<Radio />} label="A" />
                <FormControlLabel
                  value="b"
                  control={<Radio color="secondary" />}
                  label="B"
                />
              </RadioGroup>
            </Box>

            <Box>
              <FormLabel>Switch</FormLabel>
              <Stack direction="row">
                <Switch defaultChecked />
                <Switch color="secondary" />
                <Switch disabled />
              </Stack>
            </Box>

            <Box>
              <FormLabel>Rating</FormLabel>
              <Box>
                <Rating defaultValue={3} />
              </Box>
            </Box>
          </Stack>

          <Box>
            <FormLabel>Slider</FormLabel>
            <Slider
              value={sliderValue}
              onChange={(_, v) => setSliderValue(v as number)}
            />
            <Slider color="secondary" defaultValue={70} />
          </Box>
        </Stack>
      </PreviewSection>

      {/* FEEDBACK */}
      <PreviewSection title="Feedback">
        <Stack spacing={2}>
          {(["standard", "filled", "outlined"] as const).map((variant) => (
            <Stack key={variant} spacing={1}>
              <Alert variant={variant} severity="success">
                Success alert ({variant})
              </Alert>
              <Alert variant={variant} severity="info">
                Info alert ({variant})
              </Alert>
              <Alert variant={variant} severity="warning">
                Warning alert ({variant})
              </Alert>
              <Alert variant={variant} severity="error">
                Error alert ({variant})
              </Alert>
            </Stack>
          ))}

          <Stack direction="row" spacing={2} alignItems="center">
            <CircularProgress />
            <CircularProgress color="secondary" />
            <Box sx={{ flex: 1 }}>
              <LinearProgress sx={{ mb: 1 }} />
              <LinearProgress
                color="secondary"
                variant="determinate"
                value={60}
              />
            </Box>
          </Stack>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {COLORS.map((c) => (
              <Chip key={c} label={c} color={c} />
            ))}
            {COLORS.slice(0, 3).map((c) => (
              <Chip key={`o-${c}`} label={c} color={c} variant="outlined" />
            ))}
            <Chip label="Deletable" onDelete={() => undefined} />
          </Stack>

          <Stack direction="row" spacing={3} alignItems="center">
            <Badge badgeContent={4} color="primary">
              <Avatar>A</Avatar>
            </Badge>

            <Badge badgeContent={99} color="secondary">
              <Avatar>B</Avatar>
            </Badge>

            <Tooltip title="This is a tooltip">
              <Button variant="outlined">Hover me</Button>
            </Tooltip>

            <Button variant="outlined" onClick={() => setSnackOpen(true)}>
              Show snackbar
            </Button>

            <Button variant="outlined" onClick={() => setDialogOpen(true)}>
              Open dialog
            </Button>
          </Stack>
        </Stack>

        <Snackbar
          open={snackOpen}
          autoHideDuration={3000}
          onClose={() => setSnackOpen(false)}
          message="Hello from the snackbar"
        />

        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
          <DialogTitle>Sample dialog</DialogTitle>

          <DialogContent>
            <DialogContentText>
              Dialog sử dụng background.paper của theme.
            </DialogContentText>
          </DialogContent>

          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={() => setDialogOpen(false)}>
              OK
            </Button>
          </DialogActions>
        </Dialog>
      </PreviewSection>

      {/* SURFACES */}
      <PreviewSection title="Surfaces & Navigation">
        <Stack spacing={3}>
          <AppBar position="static" sx={{ borderRadius: 1 }}>
            <Toolbar variant="dense">
              <Typography sx={{ flex: 1 }}>App Bar</Typography>
              <Button color="inherit">Login</Button>
            </Toolbar>
          </AppBar>

          <Tabs value={tab} onChange={(_, v) => setTab(v)}>
            <Tab label="Overview" />
            <Tab label="Details" />
            <Tab label="Settings" />
          </Tabs>

          <Stack direction="row" spacing={2}>
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="h6">Sample Card</Typography>
                <Typography variant="body2" color="text.secondary">
                  Preview how components look with this theme.
                </Typography>
              </CardContent>

              <CardActions>
                <Button size="small">Learn more</Button>
                <Button size="small" color="secondary">
                  Share
                </Button>
              </CardActions>
            </Card>

            <Card variant="outlined" sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="h6">Outlined Card</Typography>
                <Typography variant="body2" color="text.secondary">
                  Card với variant outlined.
                </Typography>
              </CardContent>
            </Card>
          </Stack>

          <Box>
            <Accordion defaultExpanded>
              <AccordionSummary>Accordion 1</AccordionSummary>
              <AccordionDetails>
                <Typography variant="body2">Accordion content.</Typography>
              </AccordionDetails>
            </Accordion>

            <Accordion>
              <AccordionSummary>Accordion 2</AccordionSummary>
              <AccordionDetails>
                <Typography variant="body2">More content.</Typography>
              </AccordionDetails>
            </Accordion>
          </Box>
        </Stack>
      </PreviewSection>

      {/* DATA DISPLAY */}
      <PreviewSection title="Data Display">
        <Stack spacing={3}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Role</TableCell>
                <TableCell align="right">Status</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {[
                ["Ada Lovelace", "Engineer", "Active"],
                ["Alan Turing", "Researcher", "Away"],
                ["Grace Hopper", "Admiral", "Active"],
              ].map(([name, role, status]) => (
                <TableRow key={name} hover>
                  <TableCell>{name}</TableCell>
                  <TableCell>{role}</TableCell>
                  <TableCell align="right">
                    <Chip
                      size="small"
                      label={status}
                      color={status === "Active" ? "success" : "default"}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <List dense>
            {["Inbox", "Drafts", "Sent"].map((item) => (
              <ListItem key={item} divider>
                <ListItemAvatar>
                  <Avatar sx={{ bgcolor: "primary.main" }}>{item[0]}</Avatar>
                </ListItemAvatar>
                <ListItemText primary={item} secondary="Secondary text" />
              </ListItem>
            ))}
          </List>

          <Pagination count={8} color="primary" />

          <Stepper activeStep={1}>
            {["Select", "Configure", "Review"].map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Stack>
      </PreviewSection>
    </Stack>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function ThemePlayground() {
  const [config, setConfig] = useState<ThemeConfig>(DEFAULT_CONFIG);
  const [codeOpen, setCodeOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const update = <K extends keyof ThemeConfig>(key: K, value: ThemeConfig[K]) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  const changeMode = (mode: ThemeMode) =>
    setConfig((prev) => ({
      ...prev,
      mode,
      ...(mode === "dark" ? DARK_BG : LIGHT_BG),
    }));

  // Theme đang chỉnh -> chỉ áp dụng cho khu vực preview
  const themeOptions = useMemo(() => buildThemeOptions(config), [config]);
  const previewTheme = useMemo(() => createTheme(themeOptions), [themeOptions]);
  const themeCode = useMemo(
    () => generateThemeCode(themeOptions),
    [themeOptions],
  );

  // Theme cố định cho phần "chrome" (settings, header, dialog) để UI luôn dùng được
  const chromeTheme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: config.mode,
          primary: { main: "#6366f1" },
        },
        shape: { borderRadius: 8 },
        typography: { button: { textTransform: "none" } },
      }),
    [config.mode],
  );

  // Tự load Google Font theo font người dùng nhập
  useEffect(() => {
    const id = "theme-playground-font";
    let link = document.getElementById(id) as HTMLLinkElement | null;

    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }

    const family = encodeURIComponent(config.fontFamily.trim()).replace(
      /%20/g,
      "+",
    );
    link.href = `https://fonts.googleapis.com/css2?family=${family}:wght@300;400;500;600;700&display=swap`;
  }, [config.fontFamily]);

  const copyTheme = async () => {
    try {
      await navigator.clipboard.writeText(themeCode);
    } catch {
      // fallback cho môi trường không có clipboard API
      const ta = document.createElement("textarea");
      ta.value = themeCode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <ThemeProvider theme={chromeTheme}>
      <CssBaseline />

      <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        {/* HEADER */}
        <Stack
          direction="row"
          spacing={2}
          sx={{
            px: 3,
            py: 1.5,
            borderBottom: 1,
            borderColor: "divider",
            flexShrink: 0,
          }}
        >
          <Typography variant="h6" sx={{ flex: 1 }}>
            MUI Theme Playground
          </Typography>

          <Button onClick={() => setConfig(DEFAULT_CONFIG)}>Reset</Button>

          <Button variant="contained" onClick={() => setCodeOpen(true)}>
            View theme code
          </Button>
        </Stack>

        {/* BODY: 2 columns */}
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: "grid",
            gridTemplateColumns: "340px 1fr",
          }}
        >
          {/* LEFT: SETTINGS */}
          <Box
            sx={{
              overflowY: "auto",
              p: 2.5,
              borderRight: 1,
              borderColor: "divider",
            }}
          >
            <Stack spacing={3} divider={<Divider flexItem />}>
              <SettingsGroup title="Mode">
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  size="small"
                  value={config.mode}
                  onChange={(_, v) => v && changeMode(v)}
                >
                  <ToggleButton value="light">Light</ToggleButton>
                  <ToggleButton value="dark">Dark</ToggleButton>
                </ToggleButtonGroup>
              </SettingsGroup>

              <SettingsGroup title="Palette">
                <ColorField
                  label="Primary"
                  value={config.primary}
                  onChange={(v) => update("primary", v)}
                />
                <ColorField
                  label="Secondary"
                  value={config.secondary}
                  onChange={(v) => update("secondary", v)}
                />
                <ColorField
                  label="Error"
                  value={config.error}
                  onChange={(v) => update("error", v)}
                />
                <ColorField
                  label="Warning"
                  value={config.warning}
                  onChange={(v) => update("warning", v)}
                />
                <ColorField
                  label="Info"
                  value={config.info}
                  onChange={(v) => update("info", v)}
                />
                <ColorField
                  label="Success"
                  value={config.success}
                  onChange={(v) => update("success", v)}
                />
              </SettingsGroup>

              <SettingsGroup title="Background">
                <ColorField
                  label="Default"
                  value={config.bgDefault}
                  onChange={(v) => update("bgDefault", v)}
                />
                <ColorField
                  label="Paper"
                  value={config.bgPaper}
                  onChange={(v) => update("bgPaper", v)}
                />
              </SettingsGroup>

              <SettingsGroup title="Typography">
                <Autocomplete
                  freeSolo
                  size="small"
                  options={FONT_OPTIONS}
                  inputValue={config.fontFamily}
                  onInputChange={(_, v) => update("fontFamily", v)}
                  renderInput={(params) => (
                    <TextField {...params} label="Font family" />
                  )}
                />

                <SliderField
                  label="Base font size"
                  value={config.fontSize}
                  min={12}
                  max={18}
                  unit="px"
                  onChange={(v) => update("fontSize", v)}
                />
              </SettingsGroup>

              <SettingsGroup title="Shape & Spacing">
                <SliderField
                  label="Border radius"
                  value={config.radius}
                  min={0}
                  max={32}
                  unit="px"
                  onChange={(v) => update("radius", v)}
                />

                <SliderField
                  label="Spacing unit"
                  value={config.spacing}
                  min={4}
                  max={12}
                  unit="px"
                  onChange={(v) => update("spacing", v)}
                />
              </SettingsGroup>

              <SettingsGroup title="Components">
                <FormControlLabel
                  control={
                    <Switch
                      checked={config.uppercaseButtons}
                      onChange={(e) =>
                        update("uppercaseButtons", e.target.checked)
                      }
                    />
                  }
                  label="Uppercase buttons"
                />

                <FormControlLabel
                  control={
                    <Switch
                      checked={config.disableButtonElevation}
                      onChange={(e) =>
                        update("disableButtonElevation", e.target.checked)
                      }
                    />
                  }
                  label="Flat buttons (no shadow)"
                />

                <FormControlLabel
                  control={
                    <Switch
                      checked={config.flatSurfaces}
                      onChange={(e) => update("flatSurfaces", e.target.checked)}
                    />
                  }
                  label="Flat surfaces (border, no shadow)"
                />
              </SettingsGroup>
            </Stack>
          </Box>

          {/* RIGHT: PREVIEW */}
          <ThemeProvider theme={previewTheme}>
            <Box
              sx={{
                overflowY: "auto",
                p: 3,
                bgcolor: "background.default",
                color: "text.primary",
                typography: "body1",
              }}
            >
              <ComponentShowcase />
            </Box>
          </ThemeProvider>
        </Box>
      </Box>

      {/* THEME CODE POPUP */}
      <Dialog
        open={codeOpen}
        onClose={() => setCodeOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Theme code</DialogTitle>

        <DialogContent dividers>
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 2,
              overflow: "auto",
              maxHeight: "60vh",
              borderRadius: 1,
              bgcolor: "action.hover",
              fontSize: 13,
              lineHeight: 1.6,
              fontFamily:
                "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace",
            }}
          >
            <code>{themeCode}</code>
          </Box>
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setCodeOpen(false)}>Close</Button>

          <Button
            variant="contained"
            color={copied ? "success" : "primary"}
            onClick={copyTheme}
          >
            {copied ? "Copied!" : "Copy"}
          </Button>
        </DialogActions>
      </Dialog>
    </ThemeProvider>
  );
}
