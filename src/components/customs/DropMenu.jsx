import * as React from "react";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { ListItemIcon, ListItemText } from "@mui/material";
import { ChevronDown } from "lucide-react";

export default function DropMenu({ color = "primary", data, value, onSelect }) {
  const id = React.useId();
  const buttonId = `${id}-button`;
  const menuId = `${id}-menu`;
  const [anchorEl, setAnchorEl] = React.useState(null);
  const open = Boolean(anchorEl);
  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <div>
      <Button
        color={color}
        size="small"
        variant="outlined"
        id={buttonId}
        aria-controls={open ? menuId : undefined}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={handleClick}
        startIcon={data?.find((item) => item.value === value)?.icon}
        endIcon={<ChevronDown />}
      >
        {data?.find((item) => item.value === value)?.text}
      </Button>
      <Menu
        id={menuId}
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        slotProps={{
          list: {
            "aria-labelledby": buttonId,
          },
        }}
      >
        {data.length > 0 &&
          data.map((item, index) => {
            return (
              <MenuItem
                disabled={item.disabled}
                key={index}
                onClick={() => {
                  if (typeof onSelect === "function") {
                    onSelect(item.value);
                    handleClose();
                  }
                }}
              >
                {item.icon && <ListItemIcon>{item.icon}</ListItemIcon>}
                <ListItemText>{item.text}</ListItemText>
              </MenuItem>
            );
          })}
      </Menu>
    </div>
  );
}
