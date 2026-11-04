import {
  Component,
  type Effect,
  type Message,
  type Route,
  type Routing,
} from "@service-laboratory/pavlus";
import {
  storeEffector as store,
  routerEffector as router,
} from "@service-laboratory/pavlus/plugins";
import view from "./app.pavlus";
import indexView from "./pages/index/index.pavlus";
import notFoundView from "./pages/not-found/not-found.pavlus";
import aboutView from "./pages/about/about.pavlus";
import { admin, type AdminState, initialAdmin } from "./pages/admin/admin.ts";
import { list, table } from "./modules/users/users.ts";
import {
  dashboard,
  type DashboardState,
  initialDashboard,
} from "./pages/dashboard/dashboard.ts";
import {
  DataList,
  initialList,
  type ListProps,
  type ListState,
  type Row,
} from "./modules/crud/list.ts";
import {
  DataTable,
  initialTable,
  type FacetFilter,
  type TableProps,
  type TableState,
} from "./modules/crud/table.ts";
import {
  settingsPage,
  initialSettings,
  type SettingsState,
} from "./modules/settings/settings.ts";
import {
  userForm,
  initialUserForm,
  type UserFormState,
} from "./modules/forms/user-form.ts";
import {
  roleForm,
  initialRoleForm,
  type RoleFormState,
} from "./modules/forms/role-form.ts";
import {
  permissionForm,
  initialPermissionForm,
  type PermissionFormState,
} from "./modules/forms/permission-form.ts";

export interface MenuItem {
  path: string;
  title: string;
  /** Name of the CSS mask icon the sidebar shows (`styles.css`, `.ui-sidebar-icon[data-icon=…]`). */
  icon?: string;
  /** Nested links: a category (a collapsible group in the sidebar) or nothing (a link). */
  children?: MenuItem[];
}

/** A row of the users list: what `GET /api/users` answers. */
export interface UserRow {
  id: number;
  name: string;
  email: string;
  role: string;
}

/** A row of the roles list. */
export interface RoleRow {
  id: number;
  name: string;
  description: string;
  users: number;
}

/** A row of the permissions list. */
export interface PermissionRow {
  id: number;
  code: string;
  description: string;
  /** The roles that hold it, comma-joined by the backend. */
  roles: string;
}

export interface ProductRow {
  id: number;
  name: string;
  price: string;
  stock: number;
  category: string;
}

export interface CategoryRow {
  id: number;
  name: string;
  products: number;
}

export interface OrderRow {
  id: number;
  customer: string;
  total: string;
  status: string;
  created: string;
}

export interface TaskRow {
  id: number;
  title: string;
  status: string;
  progress: number;
}

export interface ProcessRow {
  id: number;
  name: string;
  pid: number;
  cpu: string;
  memory: number;
  status: string;
}

export interface SessionRow {
  id: number;
  user: string;
  ip: string;
  created: string;
  expires: string;
}

export interface NotificationRow {
  id: number;
  title: string;
  body: string;
  read: string;
  created: string;
}

export interface AppState {
  /** Where we are; `null` until the router plugin reports it. */
  route: Route | null;
  menu: MenuItem[];
  /** The sidebar column on the desktop (`data-sidebar` on the shell). */
  sidebarOpen: boolean;
  /** The off-canvas drawer on the mobile (`data-drawer` on the shell). */
  drawerOpen: boolean;
  dashboard: DashboardState;
  admin: AdminState;
  // The list pages are `DataList`s, the data tables are `DataTable`s; the
  // forms have their own slices.
  usersAdmin: TableState<UserRow>;
  userForm: UserFormState;
  rolesAdmin: ListState<RoleRow>;
  roleForm: RoleFormState;
  permissionsAdmin: ListState<PermissionRow>;
  permissionForm: PermissionFormState;
  sessions: TableState<SessionRow>;
  shopProducts: TableState<ProductRow>;
  shopCategories: ListState<CategoryRow>;
  shopOrders: ListState<OrderRow>;
  systemTasks: TableState<TaskRow>;
  systemProcesses: TableState<ProcessRow>;
  systemNotifications: ListState<NotificationRow>;
  systemSettings: SettingsState;
}

// One component per endpoint: the same logic, other data. Users, sessions and
// products are data tables with pagination; tasks and processes add the
// toolbar (search + status facet). The rest stay plain lists.
const usersAdmin = new DataTable<UserRow>("/api/users");
const rolesAdmin = new DataList<RoleRow>("/api/roles");
const permissionsAdmin = new DataList<PermissionRow>("/api/permissions");
const sessions = new DataTable<SessionRow>("/api/sessions");
const shopProducts = new DataTable<ProductRow>("/api/products");
const shopCategories = new DataList<CategoryRow>("/api/categories");
const shopOrders = new DataList<OrderRow>("/api/orders");
const systemTasks = new DataTable<TaskRow>("/api/tasks");
const systemProcesses = new DataTable<ProcessRow>("/api/processes");
const systemNotifications = new DataList<NotificationRow>("/api/notifications");

const col = (title: string, field: string) => ({ title, field });
const props = (
  section: string,
  title: string,
  subtitle: string,
  columns: { title: string; field: string }[],
  createPath: string | null = null,
  editPath: string | null = null,
): ListProps => ({ section, title, subtitle, columns, createPath, editPath });
const tableProps = (
  section: string,
  title: string,
  subtitle: string,
  columns: { title: string; field: string }[],
  endpoint: string,
  opts: {
    createPath?: string | null;
    editPath?: string | null;
    searchable?: boolean;
    searchPlaceholder?: string | null;
    facetFilter?: FacetFilter | null;
  } = {},
): TableProps => ({
  section,
  title,
  subtitle,
  columns,
  endpoint,
  createPath: opts.createPath ?? null,
  editPath: opts.editPath ?? null,
  searchable: opts.searchable ?? false,
  searchPlaceholder: opts.searchPlaceholder ?? null,
  facetFilter: opts.facetFilter ?? null,
});

const usersProps = tableProps(
  "auth-users",
  "Users",
  "Everybody with an account, and the role it has.",
  [col("Name", "name"), col("Email", "email"), col("Role", "role")],
  "/api/users",
  { createPath: "/auth/users/new", editPath: "/auth/users" },
);
const rolesProps = props(
  "auth-roles",
  "Roles",
  "What an account may do; the permissions are on their own page.",
  [
    col("Name", "name"),
    col("Description", "description"),
    col("Users", "users"),
  ],
  "/auth/roles/new",
  "/auth/roles",
);
const permissionsProps = props(
  "auth-permissions",
  "Permissions",
  "The single rights, and which roles hold them.",
  [
    col("Code", "code"),
    col("Description", "description"),
    col("Roles", "roles"),
  ],
  "/auth/permissions/new",
  "/auth/permissions",
);
const sessionsProps = tableProps(
  "auth-sessions",
  "Sessions",
  "Who is signed in, from where, and until when.",
  [
    col("User", "user"),
    col("IP", "ip"),
    col("Created", "created"),
    col("Expires", "expires"),
  ],
  "/api/sessions",
);
const productsProps = tableProps(
  "shop-products",
  "Products",
  "The catalogue: what the shop sells, and how much is in stock.",
  [
    col("Name", "name"),
    col("Category", "category"),
    col("Price", "price"),
    col("In stock", "stock"),
  ],
  "/api/products",
);
const categoriesProps = props(
  "shop-categories",
  "Categories",
  "The catalogue's shelves, and how many products each holds.",
  [col("Name", "name"), col("Products", "products")],
);
const ordersProps = props(
  "shop-orders",
  "Orders",
  "What the users bought, the newest first.",
  [
    col("Customer", "customer"),
    col("Total", "total"),
    col("Status", "status"),
    col("Created", "created"),
  ],
);
const tasksProps = tableProps(
  "system-tasks",
  "Tasks",
  "The background jobs, and how far each one got.",
  [col("Title", "title"), col("Status", "status"), col("Progress", "progress")],
  "/api/tasks",
  {
    searchable: true,
    searchPlaceholder: "Filter tasks...",
    facetFilter: {
      field: "status",
      label: "Status",
      options: ["done", "running", "queued", "failed"],
    },
  },
);
const processesProps = tableProps(
  "system-processes",
  "Processes",
  "What is running on the server right now.",
  [
    col("Name", "name"),
    col("PID", "pid"),
    col("CPU %", "cpu"),
    col("Memory MB", "memory"),
    col("Status", "status"),
  ],
  "/api/processes",
  {
    searchable: true,
    searchPlaceholder: "Filter processes...",
    facetFilter: {
      field: "status",
      label: "Status",
      options: ["running", "sleeping"],
    },
  },
);
const notificationsProps = props(
  "system-notifications",
  "Notifications",
  "What happened lately, the newest first.",
  [
    col("Title", "title"),
    col("Message", "body"),
    col("Read", "read"),
    col("Created", "created"),
  ],
);

export const initialState: AppState = {
  route: null,
  menu: [
    {
      path: "/auth",
      title: "Auth",
      icon: "shield",
      children: [
        { path: "/auth/users", title: "Users" },
        { path: "/auth/roles", title: "Roles" },
        { path: "/auth/permissions", title: "Permissions" },
        { path: "/auth/sessions", title: "Sessions" },
      ],
    },
    { path: "/dashboard", title: "Dashboard", icon: "dashboard" },
    {
      path: "/shop",
      title: "Shop",
      icon: "shop",
      children: [
        { path: "/shop/products", title: "Products" },
        { path: "/shop/orders", title: "Orders" },
        { path: "/shop/categories", title: "Categories" },
      ],
    },
    {
      path: "/system",
      title: "System",
      icon: "system",
      children: [
        { path: "/system/tasks", title: "Tasks" },
        { path: "/system/processes", title: "Processes" },
        { path: "/system/notifications", title: "Notifications" },
        { path: "/system/settings", title: "Settings" },
      ],
    },
  ],
  sidebarOpen: true,
  drawerOpen: false,
  dashboard: initialDashboard,
  admin: initialAdmin,
  usersAdmin: initialTable(),
  userForm: initialUserForm,
  rolesAdmin: initialList(),
  roleForm: initialRoleForm,
  permissionsAdmin: initialList(),
  permissionForm: initialPermissionForm,
  sessions: initialTable(),
  shopProducts: initialTable(),
  shopCategories: initialList(),
  shopOrders: initialList(),
  systemTasks: initialTable(),
  systemProcesses: initialTable(),
  systemNotifications: initialList(),
  systemSettings: initialSettings,
};

/** The menu flattened to its links: the categories stand in for their children. */
const menuLinks = (menu: MenuItem[]): MenuItem[] =>
  menu.flatMap((item) => item.children ?? [item]);

/**
 * The shell: the header, the page the route selects (`+outlet`) and the
 * footer. It does not know what the pages contain or how they load: a page
 * that needs data handles `enter` when the router activates it. Mounting is
 * done by `createApp` (main.ts); the router wiring (`mounted`, `routeChanged`)
 * and the links (`header.navigate`, `about.navigate`...) are the defaults of
 * `Component`.
 */
export class AppShell extends Component<AppState> {
  view = view;
  // The shell repaints on every state change — the opt-in keeps the previous
  // behavior now that the dom plugin no longer follows the state by default.
  updateDomOnStateChange = true;

  routing: Routing<AppState> = {
    "/": {
      view: indexView,
      props: (s) => ({ pages: menuLinks(s.menu) }),
    },
    "/dashboard": { component: dashboard, key: "dashboard" },
    "/about": { view: aboutView, props: (s) => ({ pages: menuLinks(s.menu) }) },
    "/admin": { component: admin, key: "admin" },
    "/auth/users": {
      component: usersAdmin,
      key: "usersAdmin",
      props: () => usersProps,
    },
    "/auth/users/new": {
      component: userForm,
      key: "userForm",
      name: "userNew",
    },
    "/auth/users/:id/edit": {
      component: userForm,
      key: "userForm",
      name: "userEdit",
    },
    "/auth/roles": {
      component: rolesAdmin,
      key: "rolesAdmin",
      props: () => rolesProps,
    },
    "/auth/roles/new": {
      component: roleForm,
      key: "roleForm",
      name: "roleNew",
    },
    "/auth/roles/:id/edit": {
      component: roleForm,
      key: "roleForm",
      name: "roleEdit",
    },
    "/auth/permissions": {
      component: permissionsAdmin,
      key: "permissionsAdmin",
      props: () => permissionsProps,
    },
    "/auth/permissions/new": {
      component: permissionForm,
      key: "permissionForm",
      name: "permissionNew",
    },
    "/auth/permissions/:id/edit": {
      component: permissionForm,
      key: "permissionForm",
      name: "permissionEdit",
    },
    "/auth/sessions": {
      component: sessions,
      key: "sessions",
      props: () => sessionsProps,
    },
    "/shop/products": {
      component: shopProducts,
      key: "shopProducts",
      props: () => productsProps,
    },
    "/shop/categories": {
      component: shopCategories,
      key: "shopCategories",
      props: () => categoriesProps,
    },
    "/shop/orders": {
      component: shopOrders,
      key: "shopOrders",
      props: () => ordersProps,
    },
    "/system/tasks": {
      component: systemTasks,
      key: "systemTasks",
      props: () => tasksProps,
    },
    "/system/processes": {
      component: systemProcesses,
      key: "systemProcesses",
      props: () => processesProps,
    },
    "/system/notifications": {
      component: systemNotifications,
      key: "systemNotifications",
      props: () => notificationsProps,
    },
    "/system/settings": { component: settingsPage, key: "systemSettings" },
    "*": { view: notFoundView },
  };

  /** The desktop trigger: collapse or expand the sidebar column. */
  toggleSidebar(_msg: Message, s: AppState): Effect[] {
    return [store.set("sidebarOpen", !s.sidebarOpen)];
  }

  /** The mobile trigger: open or close the off-canvas drawer. */
  toggleDrawer(_msg: Message, s: AppState): Effect[] {
    return [store.set("drawerOpen", !s.drawerOpen)];
  }

  /** A click on the scrim behind the open drawer. */
  closeDrawer(): Effect[] {
    return [store.set("drawerOpen", false)];
  }

  // The triggers live in the header; their clicks arrive with the instance prefix.
  "header.toggleSidebar"(msg: Message, s: AppState): Effect[] {
    return this.toggleSidebar(msg, s);
  }

  "header.toggleDrawer"(msg: Message, s: AppState): Effect[] {
    return this.toggleDrawer(msg, s);
  }

  /** A click in the sidebar menu also closes the mobile drawer. */
  "sidebar.navigate"(msg: Message): Effect[] {
    return [
      store.set("drawerOpen", false),
      ...(typeof msg.payload === "string"
        ? [router.navigate(msg.payload)]
        : []),
    ];
  }
}

export const app = new AppShell();

/**
 * The components that are values in the state (`+{usersComponent}`). The
 * server needs their names to serialize the state of a rendered page, and
 * the browser to put the instances back (see main.ts, backend/ssr.ts).
 */
export const components = { list, table };
