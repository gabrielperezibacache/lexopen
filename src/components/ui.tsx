/**
 * Compatibility barrel — prefer `@/components/ui` package exports.
 * Kept so existing `from "@/components/ui"` imports keep working.
 */
export {
  formatDate,
  formatDateTime,
  UrgenciaBadge,
  StatusBadge,
  pageTitleClass,
  pageToolbarClass,
  Button,
  Input,
  Textarea,
  Select,
  Combobox,
  DatePicker,
  Dialog,
  Sheet,
  Tabs,
  Table,
  Badge,
  ToastProvider,
  useToast,
  Skeleton,
  EmptyState,
  Tooltip,
  DropdownMenu,
  CommandPalette,
  PageHeader,
  ModuleHeader,
} from "@/components/ui/index";
