import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCheck,
  Clock3,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { api, post } from "../lib/api";
import { newIdempotencyKey } from "../lib/ids";
import type { Locale, Translate } from "../lib/types";
import { Button, Field, Input, Select, Textarea } from "../components/ui";

interface PublicFormConfig {
  company_name: string;
  enabled: boolean;
  test_mode: boolean;
}
export default function PublicIntake() {
  const [lang, setLang] = useState<Locale>(() =>
    localStorage.getItem("flowpilot-locale") === "en" ? "en" : "zh",
  );
  const t: Translate = (zh, en) => (lang === "zh" ? zh : en);
  const [config, setConfig] = useState<PublicFormConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [received, setReceived] = useState<{
    event_id: string;
    received: boolean;
    duplicate: boolean;
  } | null>(null);
  const key = useRef<string | null>(null);
  useEffect(() => {
    void api<PublicFormConfig>("/public/form")
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    localStorage.setItem("flowpilot-locale", lang);
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      message: String(data.get("message") || ""),
    };
    for (const field of ["name", "company", "email", "phone", "currency"]) {
      const value = String(data.get(field) || "").trim();
      if (value) payload[field] = value;
    }
    if (data.get("budget")) payload.budget = Number(data.get("budget"));
    try {
      key.current ??= newIdempotencyKey();
      const result = await post<{
        event_id: string;
        received: boolean;
        duplicate: boolean;
      }>("/public/leads", payload, {
        headers: { "Idempotency-Key": key.current },
      });
      setReceived(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="public-page">
      <header className="public-topbar">
        <a className="brand brand-public" href="/intake">
          <span className="brand-mark">
            <i />
            <i />
            <i />
            <ArrowRight size={14} strokeWidth={3} />
          </span>
          <span>
            FlowPilot<span className="brand-dot">.</span>
          </span>
        </a>
        <Button
          variant="ghost"
          onClick={() => setLang(lang === "zh" ? "en" : "zh")}
        >
          {lang === "zh" ? "English" : "简体中文"}
        </Button>
      </header>
      <main className="public-main">
        <section className="public-story">
          <div className="eyebrow">LET’S BUILD YOUR NEXT STEP</div>
          <h1>
            {t("告诉我们，", "Tell us what’s next.")}
            <br />
            {t("你的业务需要什么。", "We’ll take it from here.")}
          </h1>
          <p>
            {t(
              "一份清晰的需求，是一次高效合作的开始。提交你的想法，我们会整理需求并由团队确认后跟进。",
              "A clear brief is the beginning of a good partnership. Share your plans and our team will review your inquiry before following up.",
            )}
          </p>
          <div className="public-company">
            <span className="public-company-mark">
              <Sparkles size={22} />
            </span>
            <div>
              <b>{config?.company_name || "Starbridge Automation"}</b>
              <span>
                {t("AI 与业务自动化服务", "AI & business automation services")}
              </span>
            </div>
          </div>
          <div className="public-promises">
            <div>
              <span>01</span>
              <div>
                <b>{t("需求完整接收", "Your inquiry is captured")}</b>
                <p>
                  {t(
                    "提交后生成唯一编号，方便后续核对。",
                    "A unique receipt helps you reference your inquiry.",
                  )}
                </p>
              </div>
            </div>
            <div>
              <span>02</span>
              <div>
                <b>
                  {t("整理后由人核实", "Organized by AI, checked by people")}
                </b>
                <p>
                  {t(
                    "AI 协助理解需求，关键决定由我们的团队确认。",
                    "AI helps structure the brief; our team makes the decisions.",
                  )}
                </p>
              </div>
            </div>
            <div>
              <span>03</span>
              <div>
                <b>{t("跟进保持有序", "A thoughtful follow-up")}</b>
                <p>
                  {t(
                    "回复经过人工审核，聚焦你真实的业务问题。",
                    "Replies are reviewed by a person and focus on your actual needs.",
                  )}
                </p>
              </div>
            </div>
          </div>
          <div className="public-private">
            <LockKeyhole size={16} />
            <span>
              {t(
                "联系方式仅用于这次业务咨询与后续跟进。",
                "Contact details are used for this inquiry and its follow-up.",
              )}
            </span>
          </div>
        </section>
        <section className="public-form-panel">
          {received ? (
            <div className="public-receipt">
              <div className="receipt-check">
                <CheckCheck size={33} />
              </div>
              <div className="eyebrow">INQUIRY RECEIVED</div>
              <h2>
                {received.duplicate
                  ? t("我们已收到这条咨询", "We already have your inquiry")
                  : t("需求已成功提交", "Your inquiry has been received")}
              </h2>
              <p>
                {t(
                  "以下编号对应真实接收的业务事件。我们的团队会在处理后确认下一步。",
                  "This receipt identifies your actual inquiry. Our team will review it and determine the next step.",
                )}
              </p>
              <div className="receipt-id">
                <span>{t("咨询编号", "Inquiry ID")}</span>
                <code>{received.event_id}</code>
              </div>
              {config?.test_mode && (
                <div className="public-demo-note">
                  <ShieldCheck size={17} />
                  {t(
                    "演示模式：这条咨询被标记为测试，不会发送外部邮件。",
                    "Demo mode: this inquiry is marked as test data and cannot send external email.",
                  )}
                </div>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  key.current = null;
                  setReceived(null);
                }}
              >
                <ArrowLeft size={15} />
                {t("提交另一条咨询", "Submit another inquiry")}
              </Button>
            </div>
          ) : (
            <>
              <div className="public-form-heading">
                <span>
                  <Mail size={20} />
                </span>
                <div>
                  <h2>{t("开始一次业务沟通", "Start a conversation")}</h2>
                  <p>
                    {t(
                      "尽可能填写已知信息，预算与时间可留待沟通。",
                      "Share what you know. Budget and timing can be discussed later.",
                    )}
                  </p>
                </div>
              </div>
              {config && !config.enabled ? (
                <div className="public-form-disabled">
                  <Clock3 size={30} />
                  <h3>
                    {t("咨询入口暂未开放", "Inquiries are currently closed")}
                  </h3>
                  <p>
                    {t(
                      "请通过现有业务渠道联系我们。",
                      "Please contact us through your existing business channel.",
                    )}
                  </p>
                </div>
              ) : (
                <form className="public-form" onSubmit={submit}>
                  <div className="form-grid">
                    <Field label={t("姓名", "Your name")} id="public-name">
                      <Input
                        id="public-name"
                        name="name"
                        autoComplete="name"
                        placeholder={t(
                          "如何称呼你",
                          "How should we address you?",
                        )}
                        maxLength={200}
                      />
                    </Field>
                    <Field label={t("公司", "Company")} id="public-company">
                      <Input
                        id="public-company"
                        name="company"
                        autoComplete="organization"
                        placeholder={t(
                          "公司或团队名称",
                          "Company or team name",
                        )}
                        maxLength={200}
                      />
                    </Field>
                    <Field label={t("邮箱", "Email")} id="public-email">
                      <Input
                        id="public-email"
                        type="email"
                        name="email"
                        autoComplete="email"
                        placeholder="you@company.com"
                        maxLength={254}
                      />
                    </Field>
                    <Field label={t("联系电话", "Phone")} id="public-phone">
                      <Input
                        id="public-phone"
                        type="tel"
                        name="phone"
                        autoComplete="tel"
                        placeholder={t(
                          "方便联系的号码",
                          "A number we can reach you on",
                        )}
                        maxLength={50}
                      />
                    </Field>
                    <Field
                      label={t(
                        "参考预算（可选）",
                        "Indicative budget (optional)",
                      )}
                      id="public-budget"
                    >
                      <Input
                        id="public-budget"
                        type="number"
                        name="budget"
                        min={0}
                        max={1000000000}
                        step="0.01"
                        placeholder={t("未知可留空", "Leave blank if unknown")}
                      />
                    </Field>
                    <Field label={t("币种", "Currency")} id="public-currency">
                      <Select id="public-currency" name="currency">
                        <option value="CNY">
                          CNY · {t("人民币", "Chinese yuan")}
                        </option>
                        <option value="USD">
                          USD · {t("美元", "US dollar")}
                        </option>
                        <option value="EUR">EUR · {t("欧元", "Euro")}</option>
                        <option value="AUD">AUD</option>
                        <option value="GBP">GBP</option>
                      </Select>
                    </Field>
                  </div>
                  <Field
                    label={t(
                      "想解决什么业务问题？*",
                      "What business problem can we help with? *",
                    )}
                    id="public-message"
                  >
                    <Textarea
                      id="public-message"
                      name="message"
                      required
                      minLength={8}
                      maxLength={16000}
                      rows={5}
                      placeholder={t(
                        "例如：我们需要自动整理网站客户线索、录入 CRM，并为销售人员起草跟进邮件。希望了解方案、交付周期与报价。",
                        "For example: We want to organize website leads, update our CRM, and draft follow-up emails for the sales team. We’d like to understand options, timing, and costs.",
                      )}
                    />
                  </Field>
                  {config?.test_mode && (
                    <div className="public-demo-note">
                      <ShieldCheck size={17} />
                      {t(
                        "当前为演示入口。提交内容会标记为测试，只在内部处理。",
                        "This is a demo intake form. Submissions are marked as test data and handled internally.",
                      )}
                    </div>
                  )}
                  {error && (
                    <div className="inline-error" role="alert">
                      <XCircle size={18} />
                      <span>{error}</span>
                    </div>
                  )}
                  <Button
                    type="submit"
                    loading={busy}
                    disabled={!config?.enabled}
                    className="public-submit"
                  >
                    {t("提交咨询", "Send inquiry")}
                    <ArrowRight size={17} />
                  </Button>
                  <p className="public-form-note">
                    {t(
                      "提交表示你同意我们为处理这次咨询而使用填写的联系方式。",
                      "By submitting, you agree that we may use these contact details to handle your inquiry.",
                    )}
                  </p>
                </form>
              )}
            </>
          )}
        </section>
      </main>
      <footer className="public-footer">
        <span>Powered by FlowPilot</span>
        <span>
          {t(
            "真实接收 · 人工把关 · 有序跟进",
            "Real intake · Human oversight · Thoughtful follow-up",
          )}
        </span>
      </footer>
    </div>
  );
}
