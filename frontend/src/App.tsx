import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Bell,
  Boxes,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileCheck2,
  Inbox,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Upload,
  UsersRound,
  Workflow,
  X,
  XCircle,
} from "lucide-react";
import { api, post, setCsrfToken } from "./lib/api";
import { newIdempotencyKey } from "./lib/ids";
import { ConsoleContext } from "./lib/context";
import { useApiData } from "./lib/useApiData";
import { cn, display } from "./lib/utils";
import type {
  BatchResult,
  Dashboard,
  Locale,
  Notice,
  Session,
  Settings,
  Translate,
  View,
} from "./lib/types";
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from "./components/ui";
import { DashboardPage, InboxPage, WorkflowPage } from "./pages/Overview";
import { CrmPage } from "./pages/Crm";
import { ApprovalsPage, OutboxPage } from "./pages/Approvals";
import { ExecutionsPage } from "./pages/Executions";
import { SettingsPage } from "./pages/Settings";
import { EventDialog } from "./components/EventDialog";
import PublicIntake from "./pages/PublicIntake";

const views: View[] = [
  "dashboard",
  "inbox",
  "crm",
  "workflow",
  "approvals",
  "executions",
  "outbox",
  "settings",
];
function currentView(): View {
  const value = window.location.hash.slice(1).split("?")[0];
  return views.includes(value as View) ? (value as View) : "dashboard";
}
function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={cn("brand", small && "brand-small")}>
      <span className="brand-mark">
        <i />
        <i />
        <i />
        <ArrowRight size={14} strokeWidth={3} />
      </span>
      <span>
        FlowPilot<span className="brand-dot">.</span>
      </span>
    </div>
  );
}

export default function App() {
  return /^\/intake\/?$/.test(window.location.pathname) ? (
    <PublicIntake />
  ) : (
    <AdminApp />
  );
}

function AdminApp() {
  const [lang, setLang] = useState<Locale>(() =>
    localStorage.getItem("flowpilot-locale") === "en" ? "en" : "zh",
  );
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const t: Translate = useCallback(
    (zh, en) => (lang === "zh" ? zh : en),
    [lang],
  );
  useEffect(() => {
    localStorage.setItem("flowpilot-locale", lang);
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);
  useEffect(() => {
    void api<Session>("/session")
      .then(setSession)
      .catch((e) => setSessionError(e.message))
      .finally(() => setChecking(false));
    const expired = () => {
      setSession(null);
      setCsrfToken("");
    };
    window.addEventListener("flowpilot-auth-expired", expired);
    return () => window.removeEventListener("flowpilot-auth-expired", expired);
  }, []);
  if (checking)
    return (
      <div className="initial-screen">
        <Brand />
        <LoaderCircle className="spin" size={21} />
        <p>{t("正在连接你的工作空间…", "Connecting to your workspace…")}</p>
      </div>
    );
  if (!session?.authenticated)
    return (
      <Login
        lang={lang}
        setLang={setLang}
        t={t}
        onLogin={setSession}
        initialError={sessionError}
      />
    );
  return (
    <ConsoleShell
      session={session}
      lang={lang}
      setLang={setLang}
      t={t}
      onLogout={() => setSession(null)}
    />
  );
}

function Login({
  lang,
  setLang,
  t,
  onLogin,
  initialError,
}: {
  lang: Locale;
  setLang: (lang: Locale) => void;
  t: Translate;
  onLogin: (session: Session) => void;
  initialError: string;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin(await post<Session>("/login", { password }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <div className="login-story">
        <Brand />
        <div className="login-story-main">
          <div className="login-eyebrow">
            <span />
            {t("为真实业务而构建", "BUILT FOR REAL BUSINESS")}
          </div>
          <h1>
            {t("让线索向前，", "Keep business moving.")}
            <br />
            <em>{t("把时间留给客户。", "Make room for people.")}</em>
          </h1>
          <p>
            {t(
              "从第一条咨询，到一次有温度的跟进。让 AI 处理繁复的工作，让你掌握每一个决定。",
              "From the first inquiry to a thoughtful follow-up. Let AI handle the repetitive work while you stay in control of every decision.",
            )}
          </p>
          <div className="login-flow">
            <span>
              <Inbox size={20} />
            </span>
            <i />
            <span>
              <Sparkles size={20} />
            </span>
            <i />
            <span className="login-flow-active">
              <ShieldCheck size={20} />
            </span>
            <i />
            <span>
              <Mail size={20} />
            </span>
          </div>
          <div className="login-values">
            <span>
              <Check size={15} />
              {t("真实执行", "Real execution")}
            </span>
            <span>
              <Check size={15} />
              {t("人工审批", "Human approval")}
            </span>
            <span>
              <Check size={15} />
              {t("全程可追溯", "Full traceability")}
            </span>
          </div>
        </div>
        <div className="login-story-footer">
          FLOWPILOT / LEAD OPERATIONS<span>01 — INTAKE TO FOLLOW-UP</span>
        </div>
      </div>
      <div className="login-form-side">
        <Button
          variant="ghost"
          className="login-locale"
          onClick={() => setLang(lang === "zh" ? "en" : "zh")}
        >
          {lang === "zh" ? "English" : "简体中文"}
        </Button>
        <form onSubmit={submit} className="login-form">
          <div className="login-lock">
            <LockKeyhole size={23} />
          </div>
          <div className="eyebrow">YOUR WORKSPACE</div>
          <h2>{t("欢迎回到工作台", "Welcome to your workspace")}</h2>
          <p>
            {t(
              "登录后，继续推动你的客户业务。",
              "Sign in and keep your lead operations moving.",
            )}
          </p>
          <Field
            id="login-password"
            label={t("管理员密码", "Administrator password")}
          >
            <Input
              id="login-password"
              data-testid="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t(
                "输入部署时设置的密码",
                "Password configured during deployment",
              )}
              required
              autoFocus
            />
          </Field>
          {error && (
            <div className="inline-error" role="alert">
              <XCircle size={17} />
              <span>{error}</span>
            </div>
          )}
          <Button
            type="submit"
            data-testid="login-submit"
            loading={busy}
            className="login-submit"
          >
            {t("进入工作空间", "Enter workspace")}
            <ArrowRight size={17} />
          </Button>
          <div className="login-note">
            <ShieldCheck size={16} />
            <span>
              {t(
                "默认使用测试发件箱。外部发送始终需要人工授权。",
                "Test outbox by default. External delivery always requires explicit approval.",
              )}
            </span>
          </div>
          <div className="login-setup">
            <CircleHelp size={15} />
            <span>
              {t(
                "首次使用？运行交付包中的 bootstrap.py 设置管理员密码。",
                "First time here? Run bootstrap.py from the delivery package to set an administrator password.",
              )}
            </span>
          </div>
        </form>
        <span className="login-copyright">
          FlowPilot ·{" "}
          {t("你的业务，始终由你掌控", "Your business. Your control.")}
        </span>
      </div>
    </div>
  );
}

function ConsoleShell({
  session,
  lang,
  setLang,
  t,
  onLogout,
}: {
  session: Session;
  lang: Locale;
  setLang: (lang: Locale) => void;
  t: Translate;
  onLogout: () => void;
}) {
  const [view, setView] = useState<View>(currentView);
  const [nonce, setNonce] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [eventId, setEventId] = useState<string | null>(null);
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [batch, setBatch] = useState<BatchResult | null>(null);
  const [search, setSearch] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const dashboardQuery = useApiData<Dashboard>("/dashboard", nonce);
  const workspaceQuery = useApiData<Settings>("/settings", nonce, false);
  const dashboard = dashboardQuery.data;
  const notify = useCallback(
    (kind: Notice["kind"], title: string, detail?: string) => {
      window.clearTimeout(timer.current);
      setNotice({ kind, title, detail, id: Date.now() });
      timer.current = window.setTimeout(
        () => setNotice(null),
        kind === "error" ? 11000 : 6500,
      );
    },
    [],
  );
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const navigate = useCallback((next: View) => {
    window.location.hash = next;
    setView(next);
    setSidebarOpen(false);
  }, []);
  useEffect(() => {
    const onHash = () => { setView(currentView()); setEventId(null); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  async function runTest() {
    setTestBusy(true);
    try {
      const result = await post<BatchResult>("/demo/run");
      setBatch(result);
      refresh();
      notify(
        "success",
        t("测试事件已提交", "Sample events submitted"),
        t(
          `${result.accepted} 条已接收，${result.duplicates} 条去重，${result.rejected} 条校验未通过。`,
          `${result.accepted} accepted, ${result.duplicates} deduplicated, ${result.rejected} rejected by validation.`,
        ),
      );
    } catch (e) {
      notify(
        "error",
        t("无法启动测试", "Could not start test"),
        (e as Error).message,
      );
    } finally {
      setTestBusy(false);
    }
  }
  const navigation = [
    {
      id: "dashboard" as View,
      zh: "运行概览",
      en: "Overview",
      icon: LayoutDashboard,
    },
    { id: "inbox" as View, zh: "线索收件箱", en: "Lead inbox", icon: Inbox },
    { id: "crm" as View, zh: "客户关系", en: "CRM", icon: UsersRound },
    {
      id: "workflow" as View,
      zh: "自动化流程",
      en: "Workflow",
      icon: Workflow,
    },
    {
      id: "approvals" as View,
      zh: "人工审批",
      en: "Approvals",
      icon: FileCheck2,
      count: dashboard?.pending_approvals,
    },
    {
      id: "executions" as View,
      zh: "执行记录",
      en: "Executions",
      icon: Activity,
    },
    { id: "outbox" as View, zh: "发件箱", en: "Outbox", icon: Mail },
  ];
  const label =
    view === "settings"
      ? t("设置", "Settings")
      : t(
          navigation.find((n) => n.id === view)?.zh || "",
          navigation.find((n) => n.id === view)?.en || "",
        );
  const sharedActions = (
    <>
      <Button
        variant="outline"
        data-testid="new-lead"
        onClick={() => setNewLeadOpen(true)}
      >
        <Plus size={16} />
        {t("提交线索", "New lead")}
      </Button>
      <Button data-testid="run-demo" onClick={runTest} loading={testBusy}>
        <Play size={14} fill="currentColor" />
        {t("运行测试", "Run test")}
      </Button>
    </>
  );
  return (
    <ConsoleContext.Provider
      value={{
        lang,
        t,
        notify,
        refresh,
        nonce,
        dashboard,
        navigate,
        openEvent: setEventId,
      }}
    >
      <div className="console-layout">
        {sidebarOpen && (
          <div
            className="mobile-backdrop"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside className={cn("sidebar", sidebarOpen && "sidebar-open")}>
          <a
            href="#dashboard"
            className="brand-link"
            aria-label="FlowPilot home"
          >
            <Brand />
          </a>
          <div className="workspace-switch">
            <div className="workspace-symbol">
              <Boxes size={19} />
            </div>
            <div>
              <b>
                {workspaceQuery.data?.company_name || "Starbridge Automation"}
              </b>
              <span>{t("销售运营工作空间", "Sales operations")}</span>
            </div>
            <ChevronDown size={14} />
          </div>
          <div className="nav-caption">{t("工作空间", "WORKSPACE")}</div>
          <nav aria-label={t("主导航", "Main navigation")}>
            {navigation.map((item, index) => (
              <div key={item.id}>
                {index === 4 && <div className="nav-separator" />}
                <button
                  className={cn("nav-item", view === item.id && "nav-active")}
                  onClick={() => navigate(item.id)}
                  aria-current={view === item.id ? "page" : undefined}
                >
                  <item.icon size={18} strokeWidth={1.7} />
                  <span>{t(item.zh, item.en)}</span>
                  {Boolean(item.count) && (
                    <span className="nav-count">{item.count}</span>
                  )}
                  {view === item.id && <span className="nav-active-marker" />}
                </button>
              </div>
            ))}
          </nav>
          <div className="sidebar-spacer" />
          <div className="sidebar-note">
            <div>
              <ShieldCheck size={17} />
              <b>{t("人始终在回路中", "You stay in control")}</b>
            </div>
            <p>
              {t(
                "AI 起草，每一步外发由你决定。",
                "AI prepares. You approve every delivery.",
              )}
            </p>
            <button onClick={() => navigate("approvals")}>
              {t("查看审批队列", "Review approvals")}
              <ArrowRight size={14} />
            </button>
          </div>
          <button
            className={cn(
              "nav-item settings-nav",
              view === "settings" && "nav-active",
            )}
            onClick={() => navigate("settings")}
          >
            <Settings2 size={18} strokeWidth={1.7} />
            <span>{t("工作空间设置", "Workspace settings")}</span>
          </button>
          <div className="sidebar-user">
            <div className="user-avatar">A</div>
            <div>
              <b>{session.user?.name || t("管理员", "Administrator")}</b>
              <span>{t("工作空间管理员", "Workspace administrator")}</span>
            </div>
            <button
              aria-label={t("退出登录", "Sign out")}
              title={t("退出登录", "Sign out")}
              onClick={async () => {
                try {
                  await post("/logout");
                  setCsrfToken("");
                  onLogout();
                } catch (e) {
                  notify(
                    "error",
                    t("退出失败", "Sign out failed"),
                    (e as Error).message,
                  );
                }
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="topbar-left">
              <button
                className="mobile-menu"
                aria-label={t("打开菜单", "Open menu")}
                onClick={() => setSidebarOpen(true)}
              >
                <Menu size={21} />
              </button>
              <span className="breadcrumb-root">
                {t("工作空间", "Workspace")}
              </span>
              <ChevronRight size={13} />
              <span>{label}</span>
            </div>
            <div className="topbar-right">
              <form
                className="global-search"
                onSubmit={(e) => {
                  e.preventDefault();
                  navigate("inbox");
                }}
              >
                <Search size={15} />
                <input
                  aria-label={t("搜索线索", "Search leads")}
                  placeholder={t("搜索客户、公司…", "Search customers…")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <kbd>↵</kbd>
              </form>
              <span
                className={cn(
                  "connection-status",
                  dashboardQuery.error ? "connection-error" : "",
                )}
              >
                <i />
                {dashboardQuery.error
                  ? t("连接中断", "Disconnected")
                  : dashboardQuery.updatedAt
                    ? t("实时连接", "Live connection")
                    : t("连接中", "Connecting")}
              </span>
              <a
                className="public-form-link"
                href="/intake"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("客户表单", "Customer form")}
                <ArrowRight size={12} />
              </a>
              <button
                className="locale-toggle"
                onClick={() => setLang(lang === "zh" ? "en" : "zh")}
                title={lang === "zh" ? "Switch to English" : "切换至中文"}
              >
                {lang === "zh" ? "EN" : "中"}
              </button>
              <button
                className="notification-button"
                onClick={() => navigate("approvals")}
                aria-label={t("查看待审批", "View pending approvals")}
              >
                <Bell size={18} />
                {Boolean(dashboard?.pending_approvals) && <i />}
              </button>
            </div>
          </header>
          <main className="main-content">
            {dashboardQuery.error && (
              <div className="connection-banner" role="alert">
                <XCircle size={17} />
                <span>{dashboardQuery.error}</span>
                <button onClick={() => void dashboardQuery.refresh()}>
                  {t("重新连接", "Reconnect")}
                </button>
              </div>
            )}
            {dashboard?.model_provider === "fixture" && (
              <div className="fixture-banner">
                <Sparkles size={16} />
                <span>
                  {t(
                    "当前为测试替身模式：可验证业务流程，不代表真实 LLM 推理已通过。",
                    "Fixture test mode: validates business behavior, not live LLM inference.",
                  )}
                </span>
                <button onClick={() => navigate("settings")}>
                  {t("配置真实模型", "Configure a live model")}
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
            {view === "dashboard" && (
              <DashboardPage
                actions={sharedActions}
                onNewLead={() => setNewLeadOpen(true)}
                onTest={runTest}
                testBusy={testBusy}
              />
            )}
            {view === "inbox" && (
              <InboxPage
                search={search}
                setSearch={setSearch}
                onNewLead={() => setNewLeadOpen(true)}
                onImport={() => setImportOpen(true)}
              />
            )}
            {view === "crm" && <CrmPage />}
            {view === "workflow" && (
              <WorkflowPage onTest={runTest} testBusy={testBusy} />
            )}
            {view === "approvals" && <ApprovalsPage />}
            {view === "executions" && <ExecutionsPage />}
            {view === "outbox" && <OutboxPage />}
            {view === "settings" && <SettingsPage />}
          </main>
          <footer className="console-footer">
            <span>
              FlowPilot <span className="footer-sep">/</span>{" "}
              {t(
                "每次自动化，都有迹可循。",
                "Every automation leaves a clear trail.",
              )}
            </span>
            <span>
              {dashboard?.engine
                ? `${dashboard.engine === "n8n" ? "n8n" : t("本地执行引擎", "Local engine")}`
                : "—"}
              <span className="footer-sep">·</span>
              {t("独立工作空间", "Single workspace")}
              <span className="footer-sep">·</span>
              {dashboard?.day_timezone || "Asia/Shanghai"}
            </span>
          </footer>
        </div>
        <EventDialog eventId={eventId} onClose={() => setEventId(null)} />
        <NewLeadDialog
          open={newLeadOpen}
          onOpenChange={setNewLeadOpen}
          onCreated={(id) => {
            refresh();
            setEventId(id);
          }}
        />
        <ImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          onResult={(result) => {
            setBatch(result);
            refresh();
          }}
        />
        <BatchDialog result={batch} onClose={() => setBatch(null)} />
        {notice && (
          <div
            key={notice.id}
            className={cn("toast", `toast-${notice.kind}`)}
            role={notice.kind === "error" ? "alert" : "status"}
          >
            {notice.kind === "success" ? (
              <CheckCheck size={20} />
            ) : notice.kind === "error" ? (
              <XCircle size={20} />
            ) : (
              <Activity size={20} />
            )}
            <div>
              <b>{notice.title}</b>
              {notice.detail && <p>{notice.detail}</p>}
            </div>
            <button
              onClick={() => setNotice(null)}
              aria-label={t("关闭通知", "Dismiss notification")}
            >
              <X size={15} />
            </button>
          </div>
        )}
      </div>
    </ConsoleContext.Provider>
  );
}

function NewLeadDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const { t, notify } = useConsoleDirect();
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState(true);
  const [error, setError] = useState("");
  const idempotencyKey = useRef<string | null>(null);
  useEffect(() => {
    if (open) {
      idempotencyKey.current = null;
      setError("");
      setTest(true);
    }
  }, [open]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      source: "form",
      is_test: test,
      message: String(data.get("message") || ""),
    };
    for (const field of ["name", "company", "email", "phone", "currency"]) {
      const value = String(data.get(field) || "").trim();
      if (value) payload[field] = value;
    }
    if (data.get("budget")) payload.budget = Number(data.get("budget"));
    try {
      idempotencyKey.current ??= newIdempotencyKey();
      const result = await post<{ event: { id: string }; duplicate: boolean }>(
        "/events",
        payload,
        { headers: { "Idempotency-Key": idempotencyKey.current } },
      );
      notify(
        "success",
        result.duplicate
          ? t("已识别为重复提交", "Duplicate submission identified")
          : t("线索已接收，开始执行", "Lead received and queued"),
      );
      onOpenChange(false);
      onCreated(result.event.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t("提交客户线索", "Submit a customer lead")}
      description={t(
        "表单会创建真实服务端事件，并触发处理流程。",
        "This form creates a persistent event and triggers the workflow.",
      )}
    >
      <form onSubmit={submit} className="modal-form">
        <div className="form-grid">
          <Field label={t("客户姓名", "Customer name")} id="lead-name">
            <Input
              id="lead-name"
              data-testid="lead-name"
              name="name"
              placeholder={t("例如：李明", "e.g. Alex Chen")}
              maxLength={200}
            />
          </Field>
          <Field label={t("公司", "Company")} id="lead-company">
            <Input
              id="lead-company"
              data-testid="lead-company"
              name="company"
              placeholder={t("公司名称", "Company name")}
              maxLength={200}
            />
          </Field>
          <Field label={t("邮箱", "Email")} id="lead-email">
            <Input
              id="lead-email"
              data-testid="lead-email"
              name="email"
              type="email"
              placeholder="name@company.com"
              maxLength={254}
            />
          </Field>
          <Field label={t("联系电话", "Phone")} id="lead-phone">
            <Input
              id="lead-phone"
              name="phone"
              type="tel"
              placeholder={t("可选", "Optional")}
              maxLength={50}
            />
          </Field>
          <Field label={t("预算", "Budget")} id="lead-budget">
            <Input
              id="lead-budget"
              data-testid="lead-budget"
              name="budget"
              type="number"
              min={0}
              max={1000000000}
              step="0.01"
              placeholder={t(
                "可选，未知可留空",
                "Optional, leave blank if unknown",
              )}
            />
          </Field>
          <Field label={t("币种", "Currency")} id="lead-currency">
            <Select id="lead-currency" name="currency">
              <option value="CNY">CNY · {t("人民币", "Chinese yuan")}</option>
              <option value="USD">USD · {t("美元", "US dollar")}</option>
              <option value="EUR">EUR · {t("欧元", "Euro")}</option>
              <option value="AUD">AUD</option>
              <option value="GBP">GBP</option>
            </Select>
          </Field>
        </div>
        <Field
          label={t("客户原始需求 *", "Original customer message *")}
          id="lead-message"
          hint={t(
            "信息不足的线索会进入人工确认，不会自动猜测。",
            "Incomplete leads go to manual review instead of being guessed.",
          )}
        >
          <Textarea
            id="lead-message"
            data-testid="lead-message"
            name="message"
            required
            minLength={8}
            maxLength={16000}
            rows={5}
            placeholder={t(
              "粘贴客户邮件，或描述产品、数量、交付时间等需求…",
              "Paste the inquiry, including product, quantity, timeline, and any context…",
            )}
          />
        </Field>
        <label className="check-row">
          <input
            type="checkbox"
            checked={test}
            onChange={(e) => setTest(e.target.checked)}
          />
          <span>
            <b>{t("作为测试线索提交", "Submit as test data")}</b>
            <small>
              {t(
                "会真实更新内置 CRM，但永远不能向外部邮箱发送。",
                "Updates the built-in CRM; external email is permanently blocked for this event.",
              )}
            </small>
          </span>
        </label>
        {error && (
          <div className="inline-error" role="alert">
            <XCircle size={17} />
            <span>{error}</span>
          </div>
        )}
        <div className="dialog-actions">
          <Button
            variant="ghost"
            type="button"
            onClick={() => onOpenChange(false)}
          >
            {t("取消", "Cancel")}
          </Button>
          <Button type="submit" data-testid="lead-submit" loading={busy}>
            <Plus size={16} />
            {t("提交并运行", "Submit & run")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ImportDialog({
  open,
  onOpenChange,
  onResult,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResult: (result: BatchResult) => void;
}) {
  const { t, notify } = useConsoleDirect();
  const [file, setFile] = useState<File | null>(null);
  const [test, setTest] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    const data = new FormData();
    data.append("file", file);
    data.append("is_test", String(test));
    try {
      const result = await api<BatchResult>("/import/csv", {
        method: "POST",
        body: data,
      });
      onResult(result);
      onOpenChange(false);
      notify("success", t("CSV 已处理", "CSV processed"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function downloadTemplate() {
    const content =
      "\uFEFFname,company,email,phone,message,budget,currency\n示例客户,示例公司,contact@example.com,,需要了解企业自动化方案及报价,50000,CNY\n";
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "flowpilot-leads-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t("批量导入客户线索", "Import customer leads")}
      description={t(
        "每一行独立校验，失败的行不会写入 CRM。",
        "Each row is validated separately. Invalid rows never enter the CRM.",
      )}
    >
      <form onSubmit={submit} className="modal-form">
        <label className="file-drop">
          <Upload size={29} strokeWidth={1.5} />
          <b>{file ? file.name : t("选择 CSV 文件", "Choose a CSV file")}</b>
          <span>
            {t(
              "UTF-8 编码，支持 name、company、email、phone、message、budget、currency",
              "UTF-8 CSV: name, company, email, phone, message, budget, currency",
            )}
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            required
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setError("");
            }}
          />
        </label>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={downloadTemplate}
        >
          <ArrowDownToLine size={14} />
          {t("下载 CSV 模板", "Download CSV template")}
        </Button>
        <label className="check-row">
          <input
            type="checkbox"
            checked={test}
            onChange={(e) => setTest(e.target.checked)}
          />
          <span>
            <b>{t("将这批数据标记为测试", "Mark this batch as test data")}</b>
            <small>
              {t(
                "测试线索不能进行真实外部发送。",
                "Test leads cannot be delivered to external recipients.",
              )}
            </small>
          </span>
        </label>
        {error && (
          <div className="inline-error" role="alert">
            {error}
          </div>
        )}
        <div className="dialog-actions">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            {t("取消", "Cancel")}
          </Button>
          <Button type="submit" loading={busy} disabled={!file}>
            <Upload size={16} />
            {t("导入并执行", "Import & run")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function BatchDialog({
  result,
  onClose,
}: {
  result: BatchResult | null;
  onClose: () => void;
}) {
  const { t } = useConsoleDirect();
  return (
    <Modal
      open={!!result}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("事件接收结果", "Event intake results")}
      description={t(
        "已接收表示进入执行队列；流程是否成功，请查看执行记录。",
        "Accepted events are queued. Check execution history for actual workflow outcomes.",
      )}
    >
      <div className="modal-form">
        <div className="batch-metrics">
          <div>
            <strong>{result?.accepted || 0}</strong>
            <span>{t("已接收", "Accepted")}</span>
          </div>
          <div>
            <strong>{result?.duplicates || 0}</strong>
            <span>{t("重复去重", "Duplicates")}</span>
          </div>
          <div>
            <strong>{result?.rejected || 0}</strong>
            <span>{t("校验未通过", "Invalid")}</span>
          </div>
        </div>
        {result?.results?.some(
          (row) =>
            row.ok === false ||
            row.error ||
            row.error_code ||
            row.detail ||
            ["rejected", "error"].includes(row.status || ""),
        ) && (
          <div className="batch-errors">
            <h4>{t("逐行校验信息", "Row validation details")}</h4>
            {result.results
              .filter(
                (row) =>
                  row.ok === false ||
                  row.error ||
                  row.error_code ||
                  row.detail ||
                  ["rejected", "error"].includes(row.status || ""),
              )
              .map((row, i) => (
                <div key={i}>
                  <Badge tone="red">
                    {t("行", "Row")} {row.row || i + 1}
                  </Badge>
                  <span>
                    {row.errors?.length
                      ? row.errors
                          .map(
                            (error) =>
                              `${error.field || ""}: ${error.message || ""}`,
                          )
                          .join(" · ")
                      : display(
                          row.message ||
                            row.error ||
                            row.detail ||
                            row.error_code,
                          t("未通过输入校验", "Input validation failed"),
                        )}
                  </span>
                </div>
              ))}
          </div>
        )}
        <div className="info-panel">
          <Activity size={18} />
          <p>
            {t(
              "所有已接收事件都会真实执行。模型未配置、接口失败或信息不足，会明确显示在对应事件里。",
              "Every accepted event enters the real workflow. Missing model configuration, API failures, and incomplete information are reported on the event.",
            )}
          </p>
        </div>
        <div className="dialog-actions">
          <Button onClick={onClose}>
            {t("查看工作台", "Back to console")}
            <ArrowRight size={16} />
          </Button>
        </div>
      </div>
    </Modal>
  );
}

import { useConsole as useConsoleDirect } from "./lib/context";
