/* @ds-bundle: {"format":3,"namespace":"PRezIbacacheDesignSystem_b910b1","components":[{"name":"Button","sourcePath":"components/buttons/Button.jsx"},{"name":"IconButton","sourcePath":"components/buttons/IconButton.jsx"},{"name":"Avatar","sourcePath":"components/data-display/Avatar.jsx"},{"name":"Badge","sourcePath":"components/data-display/Badge.jsx"},{"name":"Card","sourcePath":"components/data-display/Card.jsx"},{"name":"Tag","sourcePath":"components/data-display/Tag.jsx"},{"name":"Alert","sourcePath":"components/feedback/Alert.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"RadioGroup","sourcePath":"components/forms/RadioGroup.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Textarea","sourcePath":"components/forms/Textarea.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"}],"sourceHashes":{"components/buttons/Button.jsx":"dc34e9d2c62f","components/buttons/IconButton.jsx":"9e1266add3e9","components/data-display/Avatar.jsx":"28c4cd0f062d","components/data-display/Badge.jsx":"212288e0d3e5","components/data-display/Card.jsx":"a8280df4904c","components/data-display/Tag.jsx":"4f0583953da6","components/feedback/Alert.jsx":"7acb0700dcba","components/forms/Checkbox.jsx":"799fb498034a","components/forms/Input.jsx":"34ffc4004f8a","components/forms/RadioGroup.jsx":"9eac2fa29e17","components/forms/Select.jsx":"ddf377ef7e9a","components/forms/Switch.jsx":"f7cb4b6148af","components/forms/Textarea.jsx":"5c3cc484f192","components/navigation/Tabs.jsx":"c98b297b2e52","ui_kits/website/Header.jsx":"2c98cdf6cac2","ui_kits/website/Hero.jsx":"13dc36ab1ea6","ui_kits/website/Proyectos.jsx":"c8f37f308c25","ui_kits/website/Sections.jsx":"40b40f39ad8a","ui_kits/website/TeamContact.jsx":"ed98ae3be650"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.PRezIbacacheDesignSystem_b910b1 = window.PRezIbacacheDesignSystem_b910b1 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/buttons/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Button — primary action control for Pérez Ibacache & Asociados.
 * Variants: primary (Verde Profundo), secondary (outline), ghost, subtle (ice), danger.
 */
function Button({
  children,
  variant = "primary",
  size = "md",
  fullWidth = false,
  disabled = false,
  iconLeft = null,
  iconRight = null,
  type = "button",
  onClick,
  style = {},
  ...rest
}) {
  const sizes = {
    sm: {
      height: "var(--control-h-sm)",
      padding: "0 16px",
      font: "var(--text-sm)"
    },
    md: {
      height: "var(--control-h-md)",
      padding: "0 22px",
      font: "var(--text-base)"
    },
    lg: {
      height: "var(--control-h-lg)",
      padding: "0 30px",
      font: "var(--text-md)"
    }
  };
  const s = sizes[size] || sizes.md;
  const variants = {
    primary: {
      background: "var(--action)",
      color: "var(--action-text)",
      border: "1px solid var(--action)"
    },
    secondary: {
      background: "transparent",
      color: "var(--text-brand)",
      border: "1.5px solid var(--teal-900)"
    },
    ghost: {
      background: "transparent",
      color: "var(--text-brand)",
      border: "1px solid transparent"
    },
    subtle: {
      background: "var(--surface-ice)",
      color: "var(--text-brand)",
      border: "1px solid transparent"
    },
    danger: {
      background: "var(--danger)",
      color: "#fff",
      border: "1px solid var(--danger)"
    }
  };
  const v = variants[variant] || variants.primary;
  const [hover, setHover] = React.useState(false);
  const [active, setActive] = React.useState(false);
  const hoverStyle = !disabled && hover ? variant === "primary" ? {
    background: "var(--action-hover)",
    borderColor: "var(--action-hover)"
  } : variant === "secondary" ? {
    background: "var(--teal-900)",
    color: "var(--action-text)"
  } : variant === "danger" ? {
    filter: "brightness(0.94)"
  } : {
    background: "var(--teal-100)"
  } : {};
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    disabled: disabled,
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setActive(false);
    },
    onMouseDown: () => setActive(true),
    onMouseUp: () => setActive(false),
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "var(--space-2)",
      width: fullWidth ? "100%" : "auto",
      height: s.height,
      padding: s.padding,
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-bold)",
      fontSize: s.font,
      letterSpacing: "0.01em",
      borderRadius: "var(--radius-md)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.45 : 1,
      transform: active && !disabled ? "translateY(1px)" : "none",
      transition: "background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-standard), filter var(--dur-fast) var(--ease-standard)",
      whiteSpace: "nowrap",
      ...v,
      ...hoverStyle,
      ...style
    }
  }, rest), iconLeft, children, iconRight);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/Button.jsx", error: String((e && e.message) || e) }); }

// components/buttons/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IconButton — square icon-only control. Pass an SVG/glyph as children.
 */
function IconButton({
  children,
  variant = "ghost",
  size = "md",
  disabled = false,
  "aria-label": ariaLabel,
  onClick,
  style = {},
  ...rest
}) {
  const sizes = {
    sm: 36,
    md: 44,
    lg: 54
  };
  const dim = sizes[size] || sizes.md;
  const [hover, setHover] = React.useState(false);
  const variants = {
    ghost: {
      background: "transparent",
      color: "var(--text-brand)"
    },
    subtle: {
      background: "var(--surface-ice)",
      color: "var(--text-brand)"
    },
    solid: {
      background: "var(--action)",
      color: "var(--action-text)"
    }
  };
  const v = variants[variant] || variants.ghost;
  const hoverBg = !disabled && hover ? variant === "solid" ? {
    background: "var(--action-hover)"
  } : {
    background: "var(--teal-100)"
  } : {};
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    "aria-label": ariaLabel,
    disabled: disabled,
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: dim,
      height: dim,
      borderRadius: "var(--radius-md)",
      border: "1px solid transparent",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.45 : 1,
      transition: "background var(--dur-fast) var(--ease-standard)",
      ...v,
      ...hoverBg,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/data-display/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Avatar — initials or image, used for attorneys / clients.
 */
function Avatar({
  name = "",
  src = null,
  size = "md",
  style = {},
  ...rest
}) {
  const sizes = {
    sm: 32,
    md: 44,
    lg: 64
  };
  const dim = sizes[size] || sizes.md;
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase();
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: dim,
      height: dim,
      borderRadius: "var(--radius-pill)",
      background: "var(--teal-900)",
      color: "var(--pia-ice)",
      fontFamily: "var(--font-display)",
      fontWeight: "var(--fw-bold)",
      fontSize: dim * 0.36,
      overflow: "hidden",
      flex: "none",
      ...style
    }
  }, rest), src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name,
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    }
  }) : initials);
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/data-display/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Badge — small status / category label.
 */
function Badge({
  children,
  variant = "neutral",
  size = "md",
  style = {},
  ...rest
}) {
  const variants = {
    neutral: {
      background: "var(--gray-100)",
      color: "var(--gray-700)"
    },
    brand: {
      background: "var(--surface-ice)",
      color: "var(--text-brand)"
    },
    solid: {
      background: "var(--teal-900)",
      color: "var(--pia-ice)"
    },
    success: {
      background: "var(--success-soft)",
      color: "var(--success)"
    },
    warning: {
      background: "var(--warning-soft)",
      color: "var(--warning)"
    },
    danger: {
      background: "var(--danger-soft)",
      color: "var(--danger)"
    }
  };
  const v = variants[variant] || variants.neutral;
  const pad = size === "sm" ? "2px 8px" : "4px 11px";
  const fs = size === "sm" ? "var(--text-xs)" : "var(--text-sm)";
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: pad,
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-bold)",
      fontSize: fs,
      lineHeight: 1.2,
      letterSpacing: "0.01em",
      borderRadius: "var(--radius-sm)",
      ...v,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/Badge.jsx", error: String((e && e.message) || e) }); }

// components/data-display/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Card — surface container. Variants: default (bordered), elevated (shadow),
 * ice (tint), dark (Verde Profundo). Optional interactive hover lift.
 */
function Card({
  children,
  variant = "default",
  padding = "lg",
  interactive = false,
  onClick,
  style = {},
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const pads = {
    none: 0,
    sm: "var(--space-4)",
    md: "var(--space-5)",
    lg: "var(--space-6)"
  };
  const variants = {
    default: {
      background: "var(--surface-card)",
      border: "1px solid var(--border-subtle)",
      boxShadow: "none"
    },
    elevated: {
      background: "var(--surface-card)",
      border: "1px solid var(--border-subtle)",
      boxShadow: "var(--shadow-md)"
    },
    ice: {
      background: "var(--surface-ice)",
      border: "1px solid transparent",
      boxShadow: "none"
    },
    dark: {
      background: "var(--surface-dark)",
      border: "1px solid transparent",
      boxShadow: "none",
      color: "var(--text-on-dark)"
    }
  };
  const v = variants[variant] || variants.default;
  const hoverStyle = interactive && hover ? {
    boxShadow: "var(--shadow-lg)",
    transform: "translateY(-2px)"
  } : {};
  return /*#__PURE__*/React.createElement("div", _extends({
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      borderRadius: "var(--radius-lg)",
      padding: pads[padding] ?? pads.lg,
      cursor: interactive ? "pointer" : "default",
      transition: "box-shadow var(--dur-base) var(--ease-standard), transform var(--dur-base) var(--ease-standard)",
      ...v,
      ...hoverStyle,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/Card.jsx", error: String((e && e.message) || e) }); }

// components/data-display/Tag.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Tag — removable / selectable pill, e.g. practice areas or filters.
 */
function Tag({
  children,
  selected = false,
  onRemove,
  onClick,
  style = {},
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("span", _extends({
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "8px",
      padding: "6px 12px",
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-regular)",
      fontSize: "var(--text-sm)",
      borderRadius: "var(--radius-pill)",
      cursor: onClick ? "pointer" : "default",
      border: selected ? "1px solid var(--teal-900)" : "1px solid var(--border-default)",
      background: selected ? "var(--teal-900)" : hover ? "var(--gray-50)" : "transparent",
      color: selected ? "var(--pia-ice)" : "var(--text-body)",
      transition: "all var(--dur-fast) var(--ease-standard)",
      ...style
    }
  }, rest), children, onRemove && /*#__PURE__*/React.createElement("button", {
    "aria-label": "Quitar",
    onClick: e => {
      e.stopPropagation();
      onRemove(e);
    },
    style: {
      border: "none",
      background: "transparent",
      cursor: "pointer",
      padding: 0,
      lineHeight: 0,
      color: "inherit",
      opacity: 0.7,
      fontSize: "14px"
    }
  }, "\u2715"));
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/Tag.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Alert.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Alert — inline message banner. Tones: info, success, warning, danger.
 */
function Alert({
  children,
  title,
  tone = "info",
  onClose,
  style = {},
  ...rest
}) {
  const tones = {
    info: {
      bg: "var(--info-soft)",
      fg: "var(--teal-800)",
      bar: "var(--teal-700)"
    },
    success: {
      bg: "var(--success-soft)",
      fg: "var(--success)",
      bar: "var(--success)"
    },
    warning: {
      bg: "var(--warning-soft)",
      fg: "var(--warning)",
      bar: "var(--warning)"
    },
    danger: {
      bg: "var(--danger-soft)",
      fg: "var(--danger)",
      bar: "var(--danger)"
    }
  };
  const t = tones[tone] || tones.info;
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "status",
    style: {
      display: "flex",
      gap: "12px",
      padding: "14px 16px",
      background: t.bg,
      borderRadius: "var(--radius-md)",
      borderLeft: `3px solid ${t.bar}`,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: "var(--fw-bold)",
      fontSize: "var(--text-base)",
      color: t.fg,
      marginBottom: children ? "3px" : 0
    }
  }, title), children && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-sm)",
      color: "var(--text-body)",
      lineHeight: 1.5
    }
  }, children)), onClose && /*#__PURE__*/React.createElement("button", {
    "aria-label": "Cerrar",
    onClick: onClose,
    style: {
      border: "none",
      background: "transparent",
      cursor: "pointer",
      color: t.fg,
      fontSize: "16px",
      lineHeight: 1,
      padding: 0,
      alignSelf: "flex-start"
    }
  }, "\u2715"));
}
Object.assign(__ds_scope, { Alert });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Alert.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Checkbox — labeled, controlled or uncontrolled.
 */
function Checkbox({
  label,
  checked,
  defaultChecked,
  onChange,
  disabled = false,
  id,
  style = {},
  ...rest
}) {
  const inputId = id || React.useId();
  const isControlled = checked !== undefined;
  const [internal, setInternal] = React.useState(defaultChecked || false);
  const on = isControlled ? checked : internal;
  const toggle = e => {
    if (disabled) return;
    if (!isControlled) setInternal(e.target.checked);
    onChange && onChange(e);
  };
  return /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "10px",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      height: 20,
      flex: "none",
      borderRadius: "var(--radius-sm)",
      border: on ? "1.5px solid var(--teal-900)" : "1.5px solid var(--border-strong)",
      background: on ? "var(--teal-900)" : "var(--surface-page)",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "all var(--dur-fast) var(--ease-standard)"
    }
  }, on && /*#__PURE__*/React.createElement("svg", {
    width: "13",
    height: "13",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "var(--pia-ice)",
    strokeWidth: "3.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("polyline", {
    points: "20 6 9 17 4 12"
  }))), /*#__PURE__*/React.createElement("input", _extends({
    id: inputId,
    type: "checkbox",
    checked: on,
    onChange: toggle,
    disabled: disabled,
    style: {
      position: "absolute",
      opacity: 0,
      width: 0,
      height: 0
    }
  }, rest)), label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-base)",
      color: "var(--text-body)"
    }
  }, label));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Input — text field with label, optional hint and error.
 */
function Input({
  label,
  hint,
  error,
  size = "md",
  iconLeft = null,
  id,
  style = {},
  containerStyle = {},
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const heights = {
    sm: "var(--control-h-sm)",
    md: "var(--control-h-md)",
    lg: "var(--control-h-lg)"
  };
  const inputId = id || React.useId();
  const borderColor = error ? "var(--danger)" : focus ? "var(--teal-700)" : "var(--border-default)";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      ...containerStyle
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-bold)",
      fontSize: "var(--text-sm)",
      color: "var(--text-strong)"
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      height: heights[size],
      padding: "0 14px",
      background: "var(--surface-page)",
      border: `1.5px solid ${borderColor}`,
      borderRadius: "var(--radius-md)",
      boxShadow: focus && !error ? "var(--focus-shadow)" : "none",
      transition: "border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)"
    }
  }, iconLeft && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-muted)",
      display: "inline-flex"
    }
  }, iconLeft), /*#__PURE__*/React.createElement("input", _extends({
    id: inputId,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      flex: 1,
      border: "none",
      outline: "none",
      background: "transparent",
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-base)",
      color: "var(--text-strong)",
      width: "100%",
      ...style
    }
  }, rest))), (hint || error) && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-xs)",
      color: error ? "var(--danger)" : "var(--text-muted)"
    }
  }, error || hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/RadioGroup.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * RadioGroup — a set of mutually exclusive options.
 */
function RadioGroup({
  name,
  value,
  defaultValue,
  onChange,
  options = [],
  style = {},
  ...rest
}) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = React.useState(defaultValue);
  const selected = isControlled ? value : internal;
  const groupName = name || React.useId();
  const pick = val => {
    if (!isControlled) setInternal(val);
    onChange && onChange(val);
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "radiogroup",
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "12px",
      ...style
    }
  }, rest), options.map(o => {
    const val = typeof o === "string" ? o : o.value;
    const text = typeof o === "string" ? o : o.label;
    const on = selected === val;
    return /*#__PURE__*/React.createElement("label", {
      key: val,
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "10px",
        cursor: "pointer"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 20,
        height: 20,
        flex: "none",
        borderRadius: "var(--radius-pill)",
        border: on ? "1.5px solid var(--teal-900)" : "1.5px solid var(--border-strong)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "border-color var(--dur-fast) var(--ease-standard)"
      }
    }, on && /*#__PURE__*/React.createElement("span", {
      style: {
        width: 10,
        height: 10,
        borderRadius: "var(--radius-pill)",
        background: "var(--teal-900)"
      }
    })), /*#__PURE__*/React.createElement("input", {
      type: "radio",
      name: groupName,
      value: val,
      checked: on,
      onChange: () => pick(val),
      style: {
        position: "absolute",
        opacity: 0,
        width: 0,
        height: 0
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-body)",
        fontSize: "var(--text-base)",
        color: "var(--text-body)"
      }
    }, text));
  }));
}
Object.assign(__ds_scope, { RadioGroup });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/RadioGroup.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Select — native dropdown styled to match the system.
 */
function Select({
  label,
  hint,
  error,
  options = [],
  size = "md",
  id,
  style = {},
  containerStyle = {},
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const heights = {
    sm: "var(--control-h-sm)",
    md: "var(--control-h-md)",
    lg: "var(--control-h-lg)"
  };
  const inputId = id || React.useId();
  const borderColor = error ? "var(--danger)" : focus ? "var(--teal-700)" : "var(--border-default)";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      ...containerStyle
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-bold)",
      fontSize: "var(--text-sm)",
      color: "var(--text-strong)"
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      display: "flex"
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    id: inputId,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      appearance: "none",
      width: "100%",
      height: heights[size],
      padding: "0 40px 0 14px",
      background: "var(--surface-page)",
      border: `1.5px solid ${borderColor}`,
      borderRadius: "var(--radius-md)",
      boxShadow: focus && !error ? "var(--focus-shadow)" : "none",
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-base)",
      color: "var(--text-strong)",
      cursor: "pointer",
      outline: "none",
      transition: "border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)",
      ...style
    }
  }, rest), options.map(o => {
    const value = typeof o === "string" ? o : o.value;
    const text = typeof o === "string" ? o : o.label;
    return /*#__PURE__*/React.createElement("option", {
      key: value,
      value: value
    }, text);
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      right: 14,
      top: "50%",
      transform: "translateY(-50%)",
      pointerEvents: "none",
      color: "var(--text-muted)"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("polyline", {
    points: "6 9 12 15 18 9"
  })))), (hint || error) && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-xs)",
      color: error ? "var(--danger)" : "var(--text-muted)"
    }
  }, error || hint));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Switch — on/off toggle.
 */
function Switch({
  label,
  checked,
  defaultChecked,
  onChange,
  disabled = false,
  id,
  style = {},
  ...rest
}) {
  const inputId = id || React.useId();
  const isControlled = checked !== undefined;
  const [internal, setInternal] = React.useState(defaultChecked || false);
  const on = isControlled ? checked : internal;
  const toggle = e => {
    if (disabled) return;
    if (!isControlled) setInternal(e.target.checked);
    onChange && onChange(e);
  };
  return /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "10px",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 42,
      height: 24,
      flex: "none",
      borderRadius: "var(--radius-pill)",
      background: on ? "var(--teal-900)" : "var(--gray-300)",
      position: "relative",
      transition: "background var(--dur-base) var(--ease-standard)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      top: 3,
      left: on ? 21 : 3,
      width: 18,
      height: 18,
      borderRadius: "var(--radius-pill)",
      background: "#fff",
      boxShadow: "var(--shadow-sm)",
      transition: "left var(--dur-base) var(--ease-out)"
    }
  })), /*#__PURE__*/React.createElement("input", _extends({
    id: inputId,
    type: "checkbox",
    role: "switch",
    checked: on,
    onChange: toggle,
    disabled: disabled,
    style: {
      position: "absolute",
      opacity: 0,
      width: 0,
      height: 0
    }
  }, rest)), label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-base)",
      color: "var(--text-body)"
    }
  }, label));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/forms/Textarea.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Textarea — multiline field with label, hint and error.
 */
function Textarea({
  label,
  hint,
  error,
  rows = 4,
  id,
  style = {},
  containerStyle = {},
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const inputId = id || React.useId();
  const borderColor = error ? "var(--danger)" : focus ? "var(--teal-700)" : "var(--border-default)";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      ...containerStyle
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-bold)",
      fontSize: "var(--text-sm)",
      color: "var(--text-strong)"
    }
  }, label), /*#__PURE__*/React.createElement("textarea", _extends({
    id: inputId,
    rows: rows,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      padding: "12px 14px",
      background: "var(--surface-page)",
      border: `1.5px solid ${borderColor}`,
      borderRadius: "var(--radius-md)",
      boxShadow: focus && !error ? "var(--focus-shadow)" : "none",
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-base)",
      color: "var(--text-strong)",
      resize: "vertical",
      outline: "none",
      transition: "border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)",
      ...style
    }
  }, rest)), (hint || error) && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-xs)",
      color: error ? "var(--danger)" : "var(--text-muted)"
    }
  }, error || hint));
}
Object.assign(__ds_scope, { Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Textarea.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Tabs — underline-style tab navigation.
 */
function Tabs({
  tabs = [],
  value,
  defaultValue,
  onChange,
  style = {},
  ...rest
}) {
  const isControlled = value !== undefined;
  const first = tabs[0] && (typeof tabs[0] === "string" ? tabs[0] : tabs[0].value);
  const [internal, setInternal] = React.useState(defaultValue ?? first);
  const active = isControlled ? value : internal;
  const pick = val => {
    if (!isControlled) setInternal(val);
    onChange && onChange(val);
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "tablist",
    style: {
      display: "flex",
      gap: "var(--space-5)",
      borderBottom: "1px solid var(--border-subtle)",
      ...style
    }
  }, rest), tabs.map(tab => {
    const val = typeof tab === "string" ? tab : tab.value;
    const text = typeof tab === "string" ? tab : tab.label;
    const on = active === val;
    return /*#__PURE__*/React.createElement("button", {
      key: val,
      role: "tab",
      "aria-selected": on,
      onClick: () => pick(val),
      style: {
        border: "none",
        background: "transparent",
        cursor: "pointer",
        padding: "12px 2px",
        marginBottom: "-1px",
        fontFamily: "var(--font-body)",
        fontWeight: "var(--fw-bold)",
        fontSize: "var(--text-base)",
        color: on ? "var(--text-brand)" : "var(--text-muted)",
        borderBottom: on ? "2px solid var(--teal-900)" : "2px solid transparent",
        transition: "color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)"
      }
    }, text);
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Header.jsx
try { (() => {
// Header.jsx — sticky site header for the Pérez Ibacache marketing site.
const NS_h = window.PRezIbacacheDesignSystem_b910b1;
function SiteHeader({
  active,
  onNav
}) {
  const {
    Button
  } = NS_h;
  const links = [{
    id: "inicio",
    label: "Inicio"
  }, {
    id: "enfoque",
    label: "Enfoque"
  }, {
    id: "areas",
    label: "Áreas"
  }, {
    id: "equipo",
    label: "Equipo"
  }, {
    id: "noticias",
    label: "Noticias"
  }, {
    id: "contacto",
    label: "Contacto"
  }];
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: "sticky",
      top: 0,
      zIndex: 50,
      background: "rgba(255,255,255,0.88)",
      backdropFilter: "blur(10px)",
      borderBottom: "1px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-xl)",
      margin: "0 auto",
      padding: "0 var(--space-6)",
      height: 76,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onNav("inicio"),
    style: {
      border: "none",
      background: "transparent",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-horizontal.png",
    alt: "P\xE9rez Ibacache & Asociados",
    style: {
      height: 38
    }
  })), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: "flex",
      gap: "var(--space-5)",
      alignItems: "center"
    }
  }, links.map(l => /*#__PURE__*/React.createElement("button", {
    key: l.id,
    onClick: () => onNav(l.id),
    className: `nav-link${active === l.id ? " is-active" : ""}`,
    style: {
      border: "none",
      background: "transparent",
      cursor: "pointer",
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-base)",
      fontWeight: active === l.id ? "var(--fw-bold)" : "var(--fw-regular)",
      color: active === l.id ? "var(--text-brand)" : "var(--text-body)",
      padding: "6px 0",
      whiteSpace: "nowrap"
    }
  }, l.label)), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 1,
      height: 18,
      background: "var(--border-subtle)",
      flex: "none"
    }
  }), /*#__PURE__*/React.createElement("a", {
    href: "https://www.altazorai.com",
    target: "_blank",
    rel: "noopener",
    className: "nav-link",
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-base)",
      fontWeight: "var(--fw-regular)",
      color: "var(--text-body)",
      textDecoration: "none",
      padding: "6px 0",
      whiteSpace: "nowrap"
    }
  }, "Altazor AI", /*#__PURE__*/React.createElement("svg", {
    width: "13",
    height: "13",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      opacity: 0.55
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M7 17L17 7M9 7h8v8"
  }))), /*#__PURE__*/React.createElement("a", {
    href: "proyectos.html",
    className: "nav-link",
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-base)",
      fontWeight: "var(--fw-regular)",
      color: "var(--text-body)",
      textDecoration: "none",
      padding: "6px 0",
      whiteSpace: "nowrap"
    }
  }, "Proyectos")), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    onClick: () => onNav("contacto"),
    style: {
      flex: "none",
      whiteSpace: "nowrap"
    }
  }, "Agendar consulta")));
}
window.SiteHeader = SiteHeader;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Header.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Hero.jsx
try { (() => {
// Hero.jsx — dark Verde Profundo hero with monogram watermark.
const NS_hero = window.PRezIbacacheDesignSystem_b910b1;
function Hero({
  onNav
}) {
  const {
    Button
  } = NS_hero;
  const areas = ["Civil", "Penal", "Laboral", "Familia", "Administrativo", "Internacional"];
  return /*#__PURE__*/React.createElement("section", {
    id: "inicio",
    style: {
      position: "relative",
      background: "var(--surface-dark)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/symbol-white.png",
    alt: "",
    "aria-hidden": "true",
    "data-parallax": "",
    className: "hero-bg-pulse",
    style: {
      position: "absolute",
      right: -120,
      top: "50%",
      transform: "translateY(-50%)",
      width: 620,
      opacity: 0.06,
      pointerEvents: "none"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      maxWidth: "var(--container-xl)",
      margin: "0 auto",
      padding: "var(--space-12) var(--space-6)",
      display: "grid",
      gridTemplateColumns: "1.25fr 0.75fr",
      gap: "var(--space-10)",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 720
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "hero-el d1",
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: "var(--space-5)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 3,
      flex: "none"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      height: 3,
      borderRadius: 1,
      background: "var(--teal-300)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 13,
      height: 3,
      borderRadius: 1,
      background: "var(--teal-300)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      height: 3,
      borderRadius: 1,
      background: "var(--teal-300)"
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-bold)",
      fontSize: 13,
      letterSpacing: "var(--tracking-eyebrow)",
      textTransform: "uppercase",
      color: "var(--teal-300)"
    }
  }, "Estudio Jur\xEDdico Integral \xB7 Chile")), /*#__PURE__*/React.createElement("h1", {
    className: "hero-el d2",
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 900,
      fontSize: "clamp(40px, 6vw, 72px)",
      lineHeight: 1.04,
      letterSpacing: "-0.02em",
      color: "var(--pia-ice)",
      margin: 0
    }
  }, "Asesor\xEDa jur\xEDdica", /*#__PURE__*/React.createElement("br", null), "con rostro humano."), /*#__PURE__*/React.createElement("p", {
    className: "hero-el d3",
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-lg)",
      lineHeight: 1.6,
      color: "var(--teal-200)",
      margin: "var(--space-5) 0 var(--space-6)",
      maxWidth: 620
    }
  }, "Cubrimos todas las materias del derecho nacional e internacional \u2014civil, penal, laboral, familia y m\xE1s\u2014 combinando el rigor t\xE9cnico del litigio con el acompa\xF1amiento de psic\xF3logos y trabajadores sociales."), /*#__PURE__*/React.createElement("div", {
    className: "hero-el d4",
    style: {
      display: "flex",
      gap: "var(--space-2)",
      flexWrap: "wrap",
      marginBottom: "var(--space-7)"
    }
  }, areas.map(a => /*#__PURE__*/React.createElement("span", {
    key: a,
    className: "tag-pill",
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-sm)",
      fontWeight: "var(--fw-bold)",
      color: "var(--teal-200)",
      border: "1px solid var(--border-on-dark)",
      borderRadius: "var(--radius-pill)",
      padding: "6px 14px"
    }
  }, a))), /*#__PURE__*/React.createElement("div", {
    className: "hero-el d5",
    style: {
      display: "flex",
      gap: "var(--space-3)",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "subtle",
    size: "lg",
    onClick: () => onNav("contacto")
  }, "Agendar consulta gratuita"), /*#__PURE__*/React.createElement("a", {
    href: "https://www.altazorai.com",
    target: "_blank",
    rel: "noopener",
    style: {
      textDecoration: "none"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "lg",
    iconLeft: /*#__PURE__*/React.createElement("svg", {
      width: "18",
      height: "18",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M19 14l.8 2 .2.0M5 18l.6 1.5"
    })),
    iconRight: /*#__PURE__*/React.createElement("svg", {
      width: "15",
      height: "15",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style: {
        opacity: 0.7
      }
    }, /*#__PURE__*/React.createElement("path", {
      d: "M7 17L17 7M9 7h8v8"
    })),
    style: {
      color: "var(--pia-ice)",
      border: "1.5px solid var(--border-on-dark)"
    }
  }, "Altazor AI")), /*#__PURE__*/React.createElement("a", {
    href: "proyectos.html",
    style: {
      textDecoration: "none"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "lg",
    iconLeft: /*#__PURE__*/React.createElement("svg", {
      width: "18",
      height: "18",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "3",
      width: "7",
      height: "7",
      rx: "1"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "14",
      y: "3",
      width: "7",
      height: "7",
      rx: "1"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "14",
      width: "7",
      height: "7",
      rx: "1"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "14",
      y: "14",
      width: "7",
      height: "7",
      rx: "1"
    })),
    style: {
      color: "var(--pia-ice)",
      border: "1.5px solid var(--border-on-dark)"
    }
  }, "Proyectos"))), /*#__PURE__*/React.createElement("div", {
    className: "scroll-bounce",
    style: {
      marginTop: "var(--space-8)",
      opacity: 0.4
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "var(--teal-300)",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 9l6 6 6-6"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "hero-el d3",
    style: {
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      borderRadius: "var(--radius-lg)",
      overflow: "hidden",
      boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
      border: "1px solid var(--border-on-dark)"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/team/gabriel-perez-duo.png",
    alt: "Gabriel P\xE9rez Ibacache",
    style: {
      display: "block",
      width: "100%",
      aspectRatio: "4 / 5",
      objectFit: "cover",
      objectPosition: "center top"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      background: "linear-gradient(180deg, rgba(1,31,32,0) 45%, rgba(1,31,32,0.85) 100%)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: "var(--space-5)",
      right: "var(--space-5)",
      bottom: "var(--space-5)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: "var(--text-xl)",
      color: "var(--pia-ice)",
      lineHeight: 1.15
    }
  }, "Gabriel P\xE9rez Ibacache"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-sm)",
      fontWeight: "var(--fw-bold)",
      color: "var(--teal-300)",
      marginTop: 4,
      letterSpacing: "0.02em"
    }
  }, "Abogado Asociado Principal"))))));
}
window.Hero = Hero;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Hero.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Proyectos.jsx
try { (() => {
// Proyectos.jsx — separate "Proyectos" page: firm initiatives, Altazor AI featured.
const NS_pj = window.PRezIbacacheDesignSystem_b910b1;
function PjHeader() {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: "sticky",
      top: 0,
      zIndex: 50,
      background: "rgba(255,255,255,0.9)",
      backdropFilter: "blur(10px)",
      borderBottom: "1px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-xl)",
      margin: "0 auto",
      padding: "0 var(--space-6)",
      height: 76,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "index.html",
    style: {
      display: "flex",
      alignItems: "center",
      textDecoration: "none"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-horizontal.png",
    alt: "P\xE9rez Ibacache & Asociados",
    style: {
      height: 38
    }
  })), /*#__PURE__*/React.createElement("a", {
    href: "index.html",
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-base)",
      color: "var(--text-body)",
      textDecoration: "none"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("line", {
    x1: "19",
    y1: "12",
    x2: "5",
    y2: "12"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "12 19 5 12 12 5"
  })), "Volver al sitio")));
}
function PjHero() {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: "var(--surface-ice)",
      borderBottom: "1px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-xl)",
      margin: "0 auto",
      padding: "var(--space-12) var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 720
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-bold)",
      fontSize: 13,
      letterSpacing: "var(--tracking-eyebrow)",
      textTransform: "uppercase",
      color: "var(--text-link)",
      marginBottom: "var(--space-4)"
    }
  }, "Proyectos"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 900,
      fontSize: "clamp(36px,5.5vw,60px)",
      lineHeight: 1.05,
      letterSpacing: "-0.02em",
      color: "var(--text-strong)",
      margin: 0
    }
  }, "Lo que estamos construyendo"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-lg)",
      lineHeight: 1.6,
      color: "var(--text-body)",
      margin: "var(--space-5) 0 0",
      maxWidth: 620
    }
  }, "Iniciativas que desarrollamos como firma, donde aportamos nuestra mirada t\xE9cnica, humana y tecnol\xF3gica a problemas que importan."))));
}

// Cover used while there is no real product screenshot — branded, on-brand.
function AltazorCover() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      height: "100%",
      minHeight: 360,
      background: "var(--surface-dark)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "var(--space-5)",
      overflow: "hidden",
      padding: "var(--space-8)"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/symbol-white.png",
    alt: "",
    "aria-hidden": "true",
    style: {
      position: "absolute",
      right: -90,
      bottom: -90,
      width: 320,
      opacity: 0.07
    }
  }), /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-vertical-white.png",
    alt: "Altazor AI",
    style: {
      width: 150,
      position: "relative"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      gap: 7,
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-bold)",
      fontSize: "var(--text-sm)",
      color: "var(--teal-200)",
      border: "1px solid var(--border-on-dark)",
      borderRadius: "var(--radius-pill)",
      padding: "7px 16px"
    }
  }, "altazorai.com", /*#__PURE__*/React.createElement("svg", {
    width: "13",
    height: "13",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M7 17L17 7M9 7h8v8"
  }))));
}
function AltazorFeature() {
  const {
    Button,
    Badge
  } = NS_pj;
  const features = ["Búsqueda semántica con citas verificables", "Chat con tus PDF (RAG)", "Estados del arte y matrices de literatura", "Exportación APA / IEEE", "Radar de becas: EURAXESS, ANID, CONICET", "Integra OpenAlex, ORCID, Zotero"];
  const paras = ["Altazor AI es un asistente de investigación académica diseñado para la comunidad científica hispanohablante. Integra inteligencia artificial con citas verificables para acompañar todo el ciclo de investigación: descubrir, leer, sintetizar, producir y gestionar.", "Permite subir tu biblioteca de papers en PDF y realizar búsquedas semánticas con respuestas sintetizadas y citadas, además de conversar directamente con tus documentos mediante tecnología RAG. Genera estados del arte, matrices de literatura y notas conectadas, y exporta bibliografías en formatos como APA e IEEE.", "Más allá de la lectura, funciona como un centro de gestión de carrera: perfil académico, red de contactos, calendario de plazos, congresos y un radar de oportunidades —becas y convocatorias— que se actualiza automáticamente desde fuentes como EURAXESS, ANID y CONICET.", "Se apoya en un motor de IA multiproveedor (OpenAI y Google Gemini) que asigna cada tarea al modelo más adecuado según costo y calidad, con integraciones a OpenAlex, Semantic Scholar, ORCID, Zotero y Google Calendar. Construido con FastAPI, React y PostgreSQL con búsqueda vectorial, reúne en una sola herramienta todo lo que un investigador necesita, con un diseño cuidado y bilingüe pensado para Latinoamérica y el mundo de habla hispana."];
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: "var(--surface-page)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-xl)",
      margin: "0 auto",
      padding: "var(--space-12) var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "0.95fr 1.05fr",
      gap: "var(--space-9)",
      alignItems: "stretch",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-xl)",
      overflow: "hidden",
      background: "var(--surface-card)"
    }
  }, /*#__PURE__*/React.createElement(AltazorCover, null), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-9) var(--space-8)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-2)",
      marginBottom: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    variant: "brand",
    size: "sm"
  }, "Plataforma"), /*#__PURE__*/React.createElement(Badge, {
    variant: "solid",
    size: "sm"
  }, "En producci\xF3n")), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 900,
      fontSize: "clamp(30px,4vw,44px)",
      lineHeight: 1.05,
      letterSpacing: "-0.02em",
      color: "var(--text-strong)",
      margin: "0 0 var(--space-2)"
    }
  }, "Altazor AI"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-bold)",
      fontSize: "var(--text-md)",
      color: "var(--text-brand)",
      margin: "0 0 var(--space-5)"
    }
  }, "Asistencia IA para investigadores acad\xE9micos y docentes"), paras.map((p, i) => /*#__PURE__*/React.createElement("p", {
    key: i,
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-base)",
      lineHeight: 1.65,
      color: "var(--text-body)",
      margin: "0 0 var(--space-4)"
    }
  }, p)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: "var(--space-2)",
      margin: "var(--space-5) 0 var(--space-7)"
    }
  }, features.map(f => /*#__PURE__*/React.createElement("span", {
    key: f,
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-sm)",
      color: "var(--text-brand)",
      background: "var(--surface-ice)",
      borderRadius: "var(--radius-pill)",
      padding: "6px 13px"
    }
  }, f))), /*#__PURE__*/React.createElement("a", {
    href: "https://www.altazorai.com",
    target: "_blank",
    rel: "noopener",
    style: {
      textDecoration: "none"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    iconRight: /*#__PURE__*/React.createElement("svg", {
      width: "17",
      height: "17",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M7 17L17 7M9 7h8v8"
    }))
  }, "Visitar altazorai.com"))))));
}
function MoreProjects() {
  const {
    Card,
    Badge
  } = NS_pj;
  const more = [{
    tag: "Investigación",
    title: "Migración forzada y cambio climático",
    body: "Estudio de los marcos jurídicos de protección para personas desplazadas por causas ambientales."
  }, {
    tag: "Pro Bono",
    title: "Salud mental y acceso a la justicia",
    body: "Acompañamiento psicosocial gratuito a familias en situación de vulnerabilidad dentro de procesos judiciales."
  }];
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: "var(--surface-subtle)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-xl)",
      margin: "0 auto",
      padding: "var(--space-12) var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 680,
      marginBottom: "var(--space-8)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-bold)",
      fontSize: 13,
      letterSpacing: "var(--tracking-eyebrow)",
      textTransform: "uppercase",
      color: "var(--text-link)",
      marginBottom: "var(--space-3)"
    }
  }, "Otros proyectos"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: "clamp(26px,3.5vw,38px)",
      lineHeight: 1.1,
      letterSpacing: "-0.015em",
      margin: 0,
      color: "var(--text-strong)"
    }
  }, "M\xE1s iniciativas en desarrollo")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: "var(--space-5)"
    }
  }, more.map(p => /*#__PURE__*/React.createElement(Card, {
    key: p.title,
    variant: "default",
    padding: "lg",
    interactive: true
  }, /*#__PURE__*/React.createElement(Badge, {
    variant: "brand",
    size: "sm"
  }, p.tag), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: "var(--text-lg)",
      color: "var(--text-strong)",
      margin: "var(--space-3) 0 var(--space-2)"
    }
  }, p.title), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-base)",
      color: "var(--text-body)",
      margin: 0,
      lineHeight: 1.6
    }
  }, p.body))), /*#__PURE__*/React.createElement("div", {
    style: {
      border: "1.5px dashed var(--border-default)",
      borderRadius: "var(--radius-lg)",
      padding: "var(--space-6)",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: "var(--text-lg)",
      color: "var(--text-muted)"
    }
  }, "+ Tu pr\xF3ximo proyecto"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-sm)",
      color: "var(--text-muted)",
      margin: 0,
      lineHeight: 1.55
    }
  }, "Env\xEDanos imagen y descripci\xF3n de cada proyecto y lo sumamos a esta galer\xEDa."))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-sm)",
      color: "var(--text-muted)",
      marginTop: "var(--space-7)",
      fontStyle: "italic"
    }
  }, "Altazor AI tiene contenido definitivo. Las otras tarjetas son marcadores basados en intereses del equipo \u2014 reempl\xE1zalas con tus proyectos reales.")));
}
function PjFooter() {
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: "var(--surface-darker)",
      borderTop: "1px solid var(--border-on-dark)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-xl)",
      margin: "0 auto",
      padding: "var(--space-8) var(--space-6)",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "var(--space-6)",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-horizontal-white.png",
    alt: "P\xE9rez Ibacache & Asociados",
    style: {
      height: 32
    }
  }), /*#__PURE__*/React.createElement("a", {
    href: "index.html",
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-sm)",
      color: "var(--pia-ice)",
      textDecoration: "none"
    }
  }, "\u2190 Volver al sitio principal")));
}
function ProyectosPage() {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PjHeader, null), /*#__PURE__*/React.createElement("main", null, /*#__PURE__*/React.createElement(PjHero, null), /*#__PURE__*/React.createElement(AltazorFeature, null), /*#__PURE__*/React.createElement(MoreProjects, null)), /*#__PURE__*/React.createElement(PjFooter, null));
}
window.ProyectosPage = ProyectosPage;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Proyectos.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Sections.jsx
try { (() => {
// Sections.jsx — Enfoque: unified section (positioning + interdisciplinary team + áreas de práctica).
const NS_s = window.PRezIbacacheDesignSystem_b910b1;
function SectionHeading({
  eyebrow,
  title,
  intro,
  dark
}) {
  const accent = dark ? "var(--teal-300)" : "var(--text-link)";
  return /*#__PURE__*/React.createElement("div", {
    "data-anim": "up",
    style: {
      maxWidth: 680,
      marginBottom: "var(--space-8)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 3,
      flex: "none"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      height: 3,
      borderRadius: 1,
      background: accent
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 13,
      height: 3,
      borderRadius: 1,
      background: accent
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      height: 3,
      borderRadius: 1,
      background: accent
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-bold)",
      fontSize: 13,
      letterSpacing: "var(--tracking-eyebrow)",
      textTransform: "uppercase",
      color: accent
    }
  }, eyebrow)), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: "clamp(28px,4vw,44px)",
      lineHeight: 1.1,
      letterSpacing: "-0.015em",
      margin: 0,
      color: dark ? "var(--pia-ice)" : "var(--text-strong)"
    }
  }, title), intro && /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-lg)",
      lineHeight: 1.6,
      color: dark ? "var(--teal-200)" : "var(--text-body)",
      marginTop: "var(--space-4)"
    }
  }, intro));
}
function Enfoque() {
  // The interdisciplinary team — our differentiator, stated once.
  const roles = [["Abogados", "Litigio y estrategia judicial a medida, en todas las materias."], ["Psicólogos", "Contención y peritajes de salud mental para cada representado."], ["Asistentes sociales", "Acompañamiento humano y redes de apoyo durante el proceso."]];

  // Practice areas — the concrete coverage, stated once.
  const areas = [{
    t: "Derecho Civil",
    d: "Contratos, responsabilidad civil, propiedad y asuntos patrimoniales de familia."
  }, {
    t: "Derecho Penal",
    d: "Defensa de imputados y representación de víctimas, garantizando el debido proceso."
  }, {
    t: "Derecho Laboral",
    d: "Despidos, tutela de derechos fundamentales y negociación colectiva."
  }, {
    t: "Derecho de Familia",
    d: "Cuidado personal, alimentos, divorcios y violencia intrafamiliar."
  }, {
    t: "Derecho Internacional",
    d: "Asuntos transfronterizos, migración forzada y derechos humanos."
  }, {
    t: "Tecnología y P. Intelectual",
    d: "Nuevas tecnologías, inteligencia artificial y protección de obras."
  }, {
    t: "Derecho Administrativo",
    d: "Defensa ante organismos del Estado, sumarios administrativos y recursos contencioso-administrativos."
  }, {
    t: "Fuerzas Armadas y de Orden",
    d: "Defensa especializada de funcionarios de las Fuerzas Armadas, Carabineros y PDI en procesos disciplinarios, penales militares y administrativos."
  }];
  return /*#__PURE__*/React.createElement("section", {
    id: "enfoque",
    style: {
      position: "relative",
      overflow: "hidden",
      background: "var(--surface-page)"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/symbol-black.png",
    alt: "",
    "aria-hidden": "true",
    style: {
      position: "absolute",
      right: -130,
      top: -90,
      width: 460,
      opacity: 0.035,
      pointerEvents: "none"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      maxWidth: "var(--container-xl)",
      margin: "0 auto",
      padding: "var(--space-12) var(--space-6) var(--space-9)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    "data-anim": "up",
    style: {
      maxWidth: 820
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 3,
      flex: "none"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      height: 3,
      borderRadius: 1,
      background: "var(--text-link)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 13,
      height: 3,
      borderRadius: 1,
      background: "var(--text-link)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      height: 3,
      borderRadius: 1,
      background: "var(--text-link)"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-bold)",
      fontSize: 13,
      letterSpacing: "var(--tracking-eyebrow)",
      textTransform: "uppercase",
      color: "var(--text-link)"
    }
  }, "Nuestro Enfoque")), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: "clamp(28px, 4vw, 48px)",
      lineHeight: 1.12,
      letterSpacing: "-0.018em",
      margin: 0,
      color: "var(--text-strong)",
      textWrap: "balance"
    }
  }, "Detr\xE1s de cada expediente hay una persona. Defenderla por completo \u2014en lo legal y en lo humano\u2014 es nuestra forma de ejercer el derecho."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-lg)",
      lineHeight: 1.6,
      color: "var(--text-body)",
      margin: "var(--space-5) 0 0",
      maxWidth: 640
    }
  }, "Por eso integramos derecho y salud mental bajo un mismo techo: psic\xF3logos y trabajadores sociales trabajan junto al equipo jur\xEDdico, cubriendo todas las materias del derecho nacional e internacional."))), /*#__PURE__*/React.createElement("div", {
    "data-anim": "up",
    style: {
      height: "clamp(240px, 30vw, 420px)",
      backgroundImage: "url('../../assets/santiago-hills.jpg')",
      backgroundSize: "cover",
      backgroundPosition: "center 60%",
      WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 22%, #000 78%, transparent 100%)",
      maskImage: "linear-gradient(to bottom, transparent 0%, #000 22%, #000 78%, transparent 100%)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-xl)",
      margin: "0 auto",
      padding: "0 var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "calc(-1 * var(--space-7))",
      display: "flex",
      alignItems: "center",
      gap: 6,
      justifyContent: "flex-end",
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-xs)",
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: "var(--text-muted)"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "10",
    r: "3"
  })), "Rapa Nui, Chile")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      maxWidth: "var(--container-xl)",
      margin: "0 auto",
      padding: "var(--space-9) var(--space-6) var(--space-12)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: "var(--space-4)"
    }
  }, roles.map(([t, d], i) => /*#__PURE__*/React.createElement("div", {
    key: t,
    "data-anim": "up",
    className: `d${i + 1}`,
    style: {
      background: "var(--surface-ice)",
      borderRadius: "var(--radius-lg)",
      padding: "var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: "var(--text-lg)",
      color: "var(--text-brand)"
    }
  }, t), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-sm)",
      color: "var(--text-muted)",
      marginTop: 8,
      lineHeight: 1.55
    }
  }, d)))), /*#__PURE__*/React.createElement("div", {
    id: "areas",
    style: {
      marginTop: "var(--space-12)",
      scrollMarginTop: 80
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-bold)",
      fontSize: 13,
      letterSpacing: "var(--tracking-eyebrow)",
      textTransform: "uppercase",
      color: "var(--text-link)",
      margin: "0 0 var(--space-6)",
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 3,
      flex: "none"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      height: 3,
      borderRadius: 1,
      background: "var(--text-link)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 13,
      height: 3,
      borderRadius: 1,
      background: "var(--text-link)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      height: 3,
      borderRadius: 1,
      background: "var(--text-link)"
    }
  })), "\xC1reas de Pr\xE1ctica \u2014 nacional e internacional"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(2, 1fr)",
      gap: "0 var(--space-9)"
    }
  }, areas.map((a, i) => /*#__PURE__*/React.createElement("div", {
    key: a.t,
    "data-anim": "up",
    className: `area-row d${i % 4 + 1}`,
    style: {
      display: "flex",
      gap: "var(--space-5)",
      padding: "var(--space-5) 0",
      borderTop: "1px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 900,
      fontSize: 22,
      color: "var(--teal-300)",
      width: 40,
      flex: "none"
    }
  }, "0", i + 1), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h4", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: "var(--text-lg)",
      color: "var(--text-strong)",
      margin: "0 0 6px"
    }
  }, a.t), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-base)",
      lineHeight: 1.6,
      color: "var(--text-body)",
      margin: 0
    }
  }, a.d))))))));
}
function Noticias() {
  const {
    Card,
    Badge
  } = NS_s;
  const featured = {
    cat: "Tecnología & Derecho",
    date: "12 jun 2026",
    title: "Altazor AI incorpora análisis de jurisprudencia en causas de familia",
    body: "La herramienta desarrollada por el estudio ahora apoya la preparación de escritos y el análisis de antecedentes en materias de familia, reduciendo tiempos sin reemplazar el criterio profesional."
  };
  const items = [{
    cat: "Salud Mental & Derecho",
    date: "28 may 2026",
    title: "El estudio expone sobre peritajes psicológicos en el debido proceso penal"
  }, {
    cat: "Derecho Laboral",
    date: "14 may 2026",
    title: "Guía práctica: qué hacer ante un despido injustificado"
  }, {
    cat: "Migración",
    date: "30 abr 2026",
    title: "Migración forzada y cambio climático: nuevos desafíos para la defensa"
  }];
  const linkStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    marginTop: "var(--space-5)",
    fontFamily: "var(--font-body)",
    fontWeight: "var(--fw-bold)",
    fontSize: "var(--text-sm)",
    color: "var(--text-link)",
    textDecoration: "none"
  };
  const metaRow = (cat, date, color) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-3)",
      marginBottom: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-bold)",
      fontSize: 12,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: color || "var(--text-link)"
    }
  }, cat), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 3,
      height: 3,
      borderRadius: "50%",
      background: "var(--border-strong)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-sm)",
      color: "var(--text-muted)"
    }
  }, date));
  return /*#__PURE__*/React.createElement("section", {
    id: "noticias",
    style: {
      background: "var(--surface-subtle)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-xl)",
      margin: "0 auto",
      padding: "var(--space-12) var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    eyebrow: "Noticias",
    title: "Novedades del estudio",
    intro: "Publicaciones, actividades y novedades de nuestra pr\xE1ctica interdisciplinaria."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1.15fr 1fr",
      gap: "var(--space-9)",
      alignItems: "start"
    }
  }, /*#__PURE__*/React.createElement(Card, {
    variant: "default",
    padding: "lg"
  }, /*#__PURE__*/React.createElement(Badge, {
    variant: "brand",
    size: "sm"
  }, "Destacado"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "var(--space-4)"
    }
  }, metaRow(featured.cat, featured.date)), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: "clamp(22px,2.4vw,30px)",
      lineHeight: 1.18,
      letterSpacing: "-0.01em",
      color: "var(--text-strong)",
      margin: "0 0 var(--space-3)"
    }
  }, featured.title), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-base)",
      lineHeight: 1.65,
      color: "var(--text-body)",
      margin: 0
    }
  }, featured.body), /*#__PURE__*/React.createElement("a", {
    href: "#noticias",
    style: linkStyle
  }, "Leer nota", /*#__PURE__*/React.createElement("svg", {
    width: "15",
    height: "15",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 12h14M13 6l6 6-6 6"
  })))), /*#__PURE__*/React.createElement("div", null, items.map((it, i) => /*#__PURE__*/React.createElement("a", {
    key: it.title,
    href: "#noticias",
    style: {
      display: "block",
      textDecoration: "none",
      padding: "var(--space-5) 0",
      borderTop: i === 0 ? "none" : "1px solid var(--border-subtle)"
    }
  }, metaRow(it.cat, it.date), /*#__PURE__*/React.createElement("h4", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: "var(--text-lg)",
      lineHeight: 1.3,
      color: "var(--text-strong)",
      margin: 0
    }
  }, it.title))), /*#__PURE__*/React.createElement("a", {
    href: "#noticias",
    style: {
      ...linkStyle,
      marginTop: "var(--space-4)"
    }
  }, "Ver todas las noticias", /*#__PURE__*/React.createElement("svg", {
    width: "15",
    height: "15",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 12h14M13 6l6 6-6 6"
  })))))));
}
// Noticias reads the same namespace (NS_s, already in scope above).

function Instagram() {
  const handle = "ejpsperezibacache";
  const profileUrl = "https://www.instagram.com/" + handle + "/";
  // Placeholder posts — replace `img` with real post images and `href` with the post URL.
  const posts = [{
    tone: "var(--teal-900)",
    cat: "Charla",
    caption: "Peritajes psicológicos en el debido proceso penal",
    likes: 128,
    comments: 14
  }, {
    tone: "var(--surface-dark)",
    cat: "Equipo",
    caption: "Nuestro modelo interdisciplinario: derecho + salud mental",
    likes: 96,
    comments: 8
  }, {
    tone: "var(--teal-800)",
    cat: "Guía",
    caption: "¿Despido injustificado? Qué hacer en los primeros 30 días",
    likes: 211,
    comments: 27
  }];
  const igGradient = "linear-gradient(45deg,#f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)";
  return /*#__PURE__*/React.createElement("section", {
    id: "instagram",
    style: {
      background: "var(--surface-page)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-xl)",
      margin: "0 auto",
      padding: "var(--space-12) var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    "data-anim": "up",
    style: {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: "var(--space-5)",
      marginBottom: "var(--space-8)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 620
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 3,
      flex: "none"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      height: 3,
      borderRadius: 1,
      background: "var(--text-link)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 13,
      height: 3,
      borderRadius: 1,
      background: "var(--text-link)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      height: 3,
      borderRadius: 1,
      background: "var(--text-link)"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-bold)",
      fontSize: 13,
      letterSpacing: "var(--tracking-eyebrow)",
      textTransform: "uppercase",
      color: "var(--text-link)"
    }
  }, "S\xEDguenos")), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: "clamp(28px,4vw,44px)",
      lineHeight: 1.1,
      letterSpacing: "-0.015em",
      margin: 0,
      color: "var(--text-strong)"
    }
  }, "\xDAltimas publicaciones"), /*#__PURE__*/React.createElement("a", {
    href: profileUrl,
    target: "_blank",
    rel: "noopener",
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      marginTop: "var(--space-3)",
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-lg)",
      fontWeight: "var(--fw-bold)",
      color: "var(--text-link)",
      textDecoration: "none"
    }
  }, "@", handle)), /*#__PURE__*/React.createElement("a", {
    href: profileUrl,
    target: "_blank",
    rel: "noopener",
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "10px 18px",
      borderRadius: "var(--radius-pill)",
      background: igGradient,
      color: "#fff",
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-bold)",
      fontSize: "var(--text-sm)",
      textDecoration: "none"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "2",
    width: "20",
    height: "20",
    rx: "5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "4"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "17.5",
    cy: "6.5",
    r: "1",
    fill: "currentColor",
    stroke: "none"
  })), "Seguir en Instagram")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: "var(--space-4)"
    }
  }, posts.map((p, i) => /*#__PURE__*/React.createElement("a", {
    key: i,
    href: profileUrl,
    target: "_blank",
    rel: "noopener",
    "data-anim": "up",
    className: `card-lift d${i + 1}`,
    style: {
      display: "block",
      textDecoration: "none",
      borderRadius: "var(--radius-lg)",
      overflow: "hidden",
      background: "var(--surface-card)",
      border: "1px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      aspectRatio: "1 / 1",
      background: p.tone,
      display: "flex",
      alignItems: "flex-end",
      padding: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: "var(--space-4)",
      left: "var(--space-4)",
      display: "inline-flex",
      alignItems: "center",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "rgba(255,255,255,0.85)",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "2",
    width: "20",
    height: "20",
    rx: "5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "4"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "17.5",
    cy: "6.5",
    r: "1",
    fill: "rgba(255,255,255,0.85)",
    stroke: "none"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-bold)",
      fontSize: 11,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "rgba(255,255,255,0.85)"
    }
  }, p.cat)), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      background: "linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      fontFamily: "var(--font-body)",
      fontSize: 11,
      fontWeight: "var(--fw-bold)",
      color: "rgba(255,255,255,0.6)",
      letterSpacing: "0.06em",
      textTransform: "uppercase"
    }
  }, "Marcador \xB7 reemplazar imagen")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-base)",
      lineHeight: 1.5,
      color: "var(--text-body)",
      margin: 0
    }
  }, p.caption), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-4)",
      marginTop: "var(--space-3)",
      color: "var(--text-muted)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-sm)"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "15",
    height: "15",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"
  })), p.likes), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-sm)"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "15",
    height: "15",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
  })), p.comments))))))));
}
window.SectionHeading = SectionHeading;
window.Enfoque = Enfoque;
window.Noticias = Noticias;
window.Instagram = Instagram;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Sections.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/TeamContact.jsx
try { (() => {
// TeamContact.jsx — Equipo (real photos/bios), client-capture intake flow, Footer.
const NS_tc = window.PRezIbacacheDesignSystem_b910b1;
function Equipo() {
  const {
    Card,
    Badge
  } = NS_tc;
  const people = [{
    name: "Gabriel Pérez",
    photo: "../../assets/team/gabriel-perez-duo.png",
    role: "Abogado Asociado Principal",
    tag: "Derecho Penal",
    bio: "Especialista en Derecho Penal y casos de connotación nacional. Profesor de Derecho Comparado y Razonamiento Jurídico; diplomado en Filosofía de la Ciencia y en Migración Forzada y Cambio Climático."
  }, {
    name: "Isabel Ibacache",
    photo: "../../assets/team/isabel-ibacache-duo.png",
    role: "Psicóloga Clínica Asociada Principal",
    tag: "Psicología Forense",
    bio: "Especialista en Psicología Forense y Trastorno del Espectro Autista. Más de 30 años acompañando a familias en situación de vulnerabilidad."
  }, {
    name: "Felipe Morales",
    photo: "../../assets/team/felipe-morales-duo.png",
    role: "Procurador",
    tag: "Tecnología e IA",
    bio: "Egresado de Ciencias Jurídicas y Sociales. Especialista en nuevas tecnologías, inteligencia artificial y propiedad intelectual."
  }];
  return /*#__PURE__*/React.createElement("section", {
    id: "equipo",
    style: {
      background: "var(--surface-subtle)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-xl)",
      margin: "0 auto",
      padding: "var(--space-12) var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    eyebrow: "El Equipo",
    title: "Personas t\xE9cnicas y humanas",
    intro: "Abogados, psic\xF3logos y procuradores que trabajan como una sola unidad para cada caso."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: "var(--space-5)"
    }
  }, people.map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: p.name,
    "data-anim": "up",
    className: `card-lift d${i + 1}`
  }, /*#__PURE__*/React.createElement(Card, {
    variant: "default",
    padding: "none",
    style: {
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      aspectRatio: "3 / 4",
      overflow: "hidden",
      background: "var(--teal-900)"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: p.photo,
    alt: p.name,
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      objectPosition: "center top",
      display: "block"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 3,
      background: "linear-gradient(90deg, var(--teal-400), rgba(91,166,168,0))"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-5)"
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    variant: "brand",
    size: "sm"
  }, p.tag), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: "var(--text-lg)",
      color: "var(--text-strong)",
      margin: "var(--space-3) 0 2px"
    }
  }, p.name), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-bold)",
      fontSize: "var(--text-sm)",
      color: "var(--text-brand)",
      margin: "0 0 var(--space-3)"
    }
  }, p.role), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-sm)",
      color: "var(--text-muted)",
      margin: 0,
      lineHeight: 1.55
    }
  }, p.bio))))))));
}
function Ubicacion() {
  return /*#__PURE__*/React.createElement("section", {
    id: "ubicacion",
    style: {
      position: "relative",
      minHeight: "clamp(300px, 42vh, 460px)",
      backgroundImage: "url('../../assets/santiago-skyline.jpg')",
      backgroundSize: "cover",
      backgroundPosition: "center top",
      display: "flex",
      alignItems: "flex-end"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      background: "linear-gradient(180deg, rgba(2,55,57,0) 0%, rgba(2,55,57,0.08) 28%, rgba(2,55,57,0.6) 58%, rgba(2,55,57,1) 80%, rgba(2,55,57,1) 100%)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      width: "100%",
      maxWidth: "var(--container-xl)",
      margin: "0 auto",
      padding: "var(--space-10) var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 3,
      flex: "none"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      height: 3,
      borderRadius: 1,
      background: "var(--teal-300)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 13,
      height: 3,
      borderRadius: 1,
      background: "var(--teal-300)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      height: 3,
      borderRadius: 1,
      background: "var(--teal-300)"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-bold)",
      fontSize: 13,
      letterSpacing: "var(--tracking-eyebrow)",
      textTransform: "uppercase",
      color: "var(--teal-300)"
    }
  }, "D\xF3nde estamos")), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: "clamp(30px,4.5vw,52px)",
      lineHeight: 1.05,
      letterSpacing: "-0.02em",
      margin: 0,
      color: "var(--pia-ice)"
    }
  }, "Santiago de Chile"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-lg)",
      lineHeight: 1.6,
      color: "var(--teal-100)",
      margin: "var(--space-4) 0 0",
      maxWidth: 560
    }
  }, "Nicol\xE1s Palacios 1177, Quinta Normal \xB7 Atenci\xF3n presencial y remota a todo Chile, con representaci\xF3n en casos internacionales.")));
}
function Contacto() {
  const {
    Card,
    Input,
    Select,
    Textarea,
    Checkbox,
    Button,
    Alert
  } = NS_tc;
  const [sent, setSent] = React.useState(false);
  const steps = [["01", "Cuéntanos tu caso", "Completa el formulario con tu situación. Es confidencial y sin compromiso."], ["02", "Te contactamos en 24h", "Revisamos tu caso y derivamos al profesional indicado del estudio."], ["03", "Primera reunión gratuita", "Evaluamos en conjunto la estrategia legal y el acompañamiento necesario."]];
  return /*#__PURE__*/React.createElement("section", {
    id: "contacto",
    style: {
      position: "relative",
      overflow: "hidden",
      background: "var(--surface-dark)"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/symbol-white.png",
    alt: "",
    "aria-hidden": "true",
    style: {
      position: "absolute",
      left: -120,
      bottom: -110,
      width: 440,
      opacity: 0.05,
      pointerEvents: "none"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      maxWidth: "var(--container-xl)",
      margin: "0 auto",
      padding: "var(--space-12) var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    dark: true,
    eyebrow: "Contacto",
    title: "La primera consulta es gratuita y confidencial",
    intro: "As\xED trabajamos desde tu primer mensaje hasta la reuni\xF3n inicial."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1.05fr",
      gap: "var(--space-9)",
      alignItems: "start"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column"
    }
  }, steps.map(([n, t, d], i) => /*#__PURE__*/React.createElement("div", {
    key: n,
    style: {
      display: "flex",
      gap: "var(--space-4)",
      alignItems: "stretch"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      flex: "none",
      display: "flex",
      flexDirection: "column",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 900,
      fontSize: 26,
      color: "var(--teal-400)",
      lineHeight: 1
    }
  }, n), i < steps.length - 1 && /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      width: 2,
      borderRadius: 1,
      marginTop: 10,
      background: "linear-gradient(var(--teal-500), rgba(91,166,168,0.12))"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      paddingBottom: i < steps.length - 1 ? "var(--space-6)" : 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: "var(--text-md)",
      color: "var(--pia-ice)",
      marginBottom: 4
    }
  }, t), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-sm)",
      color: "var(--teal-200)",
      lineHeight: 1.55
    }
  }, d)))), /*#__PURE__*/React.createElement("div", {
    style: {
      paddingTop: "var(--space-5)",
      marginTop: "var(--space-2)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-3)"
    }
  }, [["Teléfono", "+56 9 5118 1538"], ["Correo", "contacto@perezibacache.cl"], ["Oficina", "Nicolás Palacios 1177, Quinta Normal"]].map(([k, v]) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      display: "flex",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-bold)",
      fontSize: "var(--text-sm)",
      color: "var(--teal-300)",
      width: 80,
      flex: "none"
    }
  }, k), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-base)",
      color: "var(--pia-ice)"
    }
  }, v))))), /*#__PURE__*/React.createElement(Card, {
    variant: "default",
    padding: "lg"
  }, sent ? /*#__PURE__*/React.createElement(Alert, {
    tone: "success",
    title: "Solicitud enviada"
  }, "Gracias por escribirnos. Un miembro del equipo te contactar\xE1 dentro de 24 horas h\xE1biles.") : /*#__PURE__*/React.createElement("form", {
    onSubmit: e => {
      e.preventDefault();
      setSent(true);
    },
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "Nombre completo",
    placeholder: "Ej. Camila Rojas",
    required: true
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "Correo",
    type: "email",
    placeholder: "tucorreo@mail.cl",
    required: true
  }), /*#__PURE__*/React.createElement(Input, {
    label: "Tel\xE9fono",
    type: "tel",
    placeholder: "+56 9 ..."
  })), /*#__PURE__*/React.createElement(Select, {
    label: "Materia",
    options: ["Derecho Civil", "Derecho Penal", "Derecho Laboral", "Derecho de Familia", "Derecho Internacional", "Otra / No estoy seguro"]
  }), /*#__PURE__*/React.createElement(Textarea, {
    label: "Cu\xE9ntanos tu caso",
    rows: 4,
    placeholder: "Confidencial \u2014 describe brevemente tu situaci\xF3n"
  }), /*#__PURE__*/React.createElement(Checkbox, {
    label: "Acepto la pol\xEDtica de privacidad",
    defaultChecked: true
  }), /*#__PURE__*/React.createElement(Button, {
    type: "submit",
    size: "lg",
    fullWidth: true
  }, "Enviar solicitud"))))));
}
function SiteFooter({
  onNav
}) {
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      position: "relative",
      overflow: "hidden",
      background: "var(--surface-darker)",
      borderTop: "1px solid var(--border-on-dark)"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/symbol-white.png",
    alt: "",
    "aria-hidden": "true",
    style: {
      position: "absolute",
      right: -70,
      top: -70,
      width: 280,
      opacity: 0.04,
      pointerEvents: "none"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      maxWidth: "var(--container-xl)",
      margin: "0 auto",
      padding: "var(--space-9) var(--space-6)",
      display: "flex",
      justifyContent: "space-between",
      gap: "var(--space-8)",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 320
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-horizontal-white.png",
    alt: "P\xE9rez Ibacache & Asociados",
    style: {
      height: 36
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-sm)",
      color: "var(--teal-300)",
      lineHeight: 1.6,
      marginTop: "var(--space-4)"
    }
  }, "Estudio jur\xEDdico integral. Asesor\xEDa t\xE9cnica con acompa\xF1amiento psicosocial, en todas las materias del derecho nacional e internacional.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-9)"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 2,
      flex: "none"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 14,
      height: 2.5,
      borderRadius: 1,
      background: "var(--teal-400)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 9,
      height: 2.5,
      borderRadius: 1,
      background: "var(--teal-400)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 14,
      height: 2.5,
      borderRadius: 1,
      background: "var(--teal-400)"
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-bold)",
      fontSize: 12,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color: "var(--teal-400)"
    }
  }, "Navegaci\xF3n")), [["enfoque", "Enfoque"], ["areas", "Áreas"], ["equipo", "Equipo"], ["noticias", "Noticias"], ["contacto", "Contacto"]].map(([id, label]) => /*#__PURE__*/React.createElement("button", {
    key: id,
    onClick: () => onNav(id),
    style: {
      display: "block",
      border: "none",
      background: "transparent",
      cursor: "pointer",
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-sm)",
      color: "var(--pia-ice)",
      padding: "5px 0"
    }
  }, label)), /*#__PURE__*/React.createElement("a", {
    href: "https://www.altazorai.com",
    target: "_blank",
    rel: "noopener",
    style: {
      display: "block",
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-sm)",
      color: "var(--pia-ice)",
      padding: "5px 0",
      textDecoration: "none"
    }
  }, "Altazor AI \u2197"), /*#__PURE__*/React.createElement("a", {
    href: "proyectos.html",
    style: {
      display: "block",
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-sm)",
      color: "var(--pia-ice)",
      padding: "5px 0",
      textDecoration: "none"
    }
  }, "Proyectos")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 2,
      flex: "none"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 14,
      height: 2.5,
      borderRadius: 1,
      background: "var(--teal-400)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 9,
      height: 2.5,
      borderRadius: 1,
      background: "var(--teal-400)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 14,
      height: 2.5,
      borderRadius: 1,
      background: "var(--teal-400)"
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-bold)",
      fontSize: 12,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color: "var(--teal-400)"
    }
  }, "Contacto")), ["+56 9 5118 1538", "contacto@perezibacache.cl", "Quinta Normal, Santiago"].map(v => /*#__PURE__*/React.createElement("div", {
    key: v,
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-sm)",
      color: "var(--pia-ice)",
      padding: "5px 0"
    }
  }, v))))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: "1px solid var(--border-on-dark)",
      padding: "var(--space-4) var(--space-6)",
      textAlign: "center",
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-xs)",
      color: "var(--teal-400)"
    }
  }, "\xA9 2026 P\xE9rez Ibacache & Asociados \xB7 Todos los derechos reservados"));
}
window.Equipo = Equipo;
window.Ubicacion = Ubicacion;
window.Contacto = Contacto;
window.SiteFooter = SiteFooter;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/TeamContact.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.Alert = __ds_scope.Alert;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.RadioGroup = __ds_scope.RadioGroup;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.Tabs = __ds_scope.Tabs;

})();
