import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Button, Checkbox, DatePicker, DatePickerInput, Dropdown, InlineLoading, InlineNotification,
  Modal, PasswordInput, Search, SkeletonText, TextArea, TextInput,
} from '@carbon/react';
import {
  Add, ArrowLeft, Building, ChartRelationship, Currency, Dashboard as DashboardIcon,
  Delivery as DeliveryIcon, Edit, Menu, Purchase, RequestQuote, Search as SearchIcon,
  Logout, Notification, TrashCan, UserAvatar, UserFollow, UserMultiple, ChevronRight,
} from '@carbon/icons-react';
import { Tag } from '@carbon/react';
import {
  getGetDashboardQueryKey, getGetCrmRecordQueryKey, getListCrmRecordsQueryKey,
  useCreateCrmRecord, useDeleteCrmRecord, useGetCrmRecord, useGetDashboard,
  useListCrmRecords, useUpdateCrmRecord,
} from '@workspace/api-client-react';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import type { CrmEntity, CrmRecord } from '@workspace/api-client-react';
import type { Session } from '@supabase/supabase-js';
import { Link, Route, Switch, useLocation, useParams } from 'wouter';
import { supabase, supabaseConfigured } from './lib/supabase';
import './index.css';

type Lang = 'zh' | 'en';
type FieldKind = 'text' | 'email' | 'tel' | 'number' | 'date' | 'textarea' | 'select' | 'reference' | 'checkbox';
type FieldOption = { value: string; zh: string; en: string };
type FieldDef = { key: string; kind?: FieldKind; options?: FieldOption[]; reference?: CrmEntity; required?: boolean; nullable?: boolean };
type ModuleDef = { entity: CrmEntity; label: string; en: string; icon: typeof DashboardIcon; fields: FieldDef[]; columns: string[]; statuses?: FieldOption[] };

const options = (...items: [string, string, string][]): FieldOption[] =>
  items.map(([value, zh, en]) => ({ value, zh, en }));

const currencies = options(['CNY', '人民币', 'CNY'], ['USD', '美元', 'USD'], ['EUR', '欧元', 'EUR']);
const leadStatuses = options(
  ['new', '新建', 'New'],
  ['contacted', '联系中', 'Contacted'],
  ['qualified', '已合格', 'Qualified'],
  ['unqualified', '未合格', 'Unqualified'],
);
const opportunityStages = options(
  ['prospecting', '初步接洽', 'Prospecting'],
  ['qualification', '资格审查', 'Qualification'],
  ['needs_analysis', '需求分析', 'Needs analysis'],
  ['proposal', '方案评估', 'Proposal'],
  ['negotiation', '谈判', 'Negotiation'],
  ['won', '成交', 'Won'],
  ['lost', '失败', 'Lost'],
);
const quoteStatuses = options(
  ['draft', '草稿', 'Draft'],
  ['sent', '已发送', 'Sent'],
  ['accepted', '已接受', 'Accepted'],
  ['rejected', '已拒绝', 'Rejected'],
  ['expired', '已过期', 'Expired'],
);
const orderStatuses = options(
  ['draft', '草稿', 'Draft'],
  ['confirmed', '已确认', 'Confirmed'],
  ['processing', '处理中', 'Processing'],
  ['partially_shipped', '部分发货', 'Partially shipped'],
  ['shipped', '已发货', 'Shipped'],
  ['completed', '已完成', 'Completed'],
  ['cancelled', '已取消', 'Cancelled'],
);
const deliveryStatuses = options(
  ['planned', '待安排', 'Planned'],
  ['packed', '已打包', 'Packed'],
  ['shipped', '运输中', 'Shipped'],
  ['delivered', '已送达', 'Delivered'],
  ['exception', '异常', 'Exception'],
);
const paymentStatuses = options(
  ['pending', '待处理', 'Pending'],
  ['paid', '已收款', 'Paid'],
  ['failed', '失败', 'Failed'],
  ['refunded', '已退款', 'Refunded'],
);
const activeStatuses = options(['active', '启用', 'Active'], ['inactive', '停用', 'Inactive']);

const modules: ModuleDef[] = [
  { entity: 'leads', label: '潜在客户', en: 'Leads', icon: UserFollow, fields: [
    { key: 'name', required: true }, { key: 'company' }, { key: 'title' }, { key: 'email', kind: 'email' }, { key: 'phone', kind: 'tel' },
    { key: 'source', kind: 'select', options: options(['website', '网站', 'Website'], ['event', '展会', 'Event'], ['referral', '推荐', 'Referral'], ['phone', '电话', 'Phone'], ['other', '其他', 'Other']) },
    { key: 'status', kind: 'select', options: leadStatuses },
    { key: 'rating', kind: 'select', options: options(['hot', '热', 'Hot'], ['warm', '温', 'Warm'], ['cold', '冷', 'Cold']) }, { key: 'notes', kind: 'textarea' },
  ], columns: ['name', 'company', 'title', 'email', 'source', 'status'], statuses: leadStatuses },
  { entity: 'accounts', label: '客户', en: 'Customers', icon: Building, fields: [
    { key: 'name', required: true }, { key: 'account_number' }, { key: 'type', kind: 'select', options: options(['customer', '客户', 'Customer'], ['prospect', '潜在客户', 'Prospect'], ['partner', '合作伙伴', 'Partner']) },
    { key: 'status', kind: 'select', options: activeStatuses }, { key: 'industry' },
    { key: 'website' }, { key: 'phone', kind: 'tel' }, { key: 'billing_city' }, { key: 'billing_country' }, { key: 'notes', kind: 'textarea' },
  ], columns: ['name', 'account_number', 'type', 'industry', 'phone', 'billing_city'], statuses: activeStatuses },
  { entity: 'contacts', label: '联系人', en: 'Contacts', icon: UserMultiple, fields: [
    { key: 'first_name', required: true }, { key: 'last_name' }, { key: 'account_id', kind: 'reference', reference: 'accounts', nullable: true }, { key: 'title' }, { key: 'department' },
    { key: 'email', kind: 'email' }, { key: 'phone', kind: 'tel' }, { key: 'is_primary', kind: 'checkbox' }, { key: 'status', kind: 'select', options: activeStatuses },
  ], columns: ['first_name', 'last_name', 'account_id', 'title', 'email', 'phone'], statuses: activeStatuses },
  { entity: 'opportunities', label: '销售机会', en: 'Opportunities', icon: ChartRelationship, fields: [
    { key: 'name', required: true }, { key: 'account_id', kind: 'reference', reference: 'accounts', nullable: true }, { key: 'contact_id', kind: 'reference', reference: 'contacts', nullable: true }, { key: 'stage', kind: 'select', options: opportunityStages },
    { key: 'amount', kind: 'number' }, { key: 'probability', kind: 'number' }, { key: 'close_date', kind: 'date', nullable: true },
    { key: 'lead_source', kind: 'select', options: options(['website', '网站', 'Website'], ['event', '展会', 'Event'], ['referral', '推荐', 'Referral'], ['phone', '电话', 'Phone'], ['other', '其他', 'Other']) }, { key: 'description', kind: 'textarea' },
  ], columns: ['name', 'account_id', 'stage', 'amount', 'probability', 'close_date'], statuses: opportunityStages },
  { entity: 'quotes', label: '报价', en: 'Quotes', icon: RequestQuote, fields: [
    { key: 'quote_number', required: true }, { key: 'opportunity_id', kind: 'reference', reference: 'opportunities', nullable: true }, { key: 'account_id', kind: 'reference', reference: 'accounts', nullable: true },
    { key: 'status', kind: 'select', options: quoteStatuses },
    { key: 'issue_date', kind: 'date' }, { key: 'expiration_date', kind: 'date', nullable: true }, { key: 'subtotal', kind: 'number' },
    { key: 'tax', kind: 'number' }, { key: 'total', kind: 'number' }, { key: 'currency', kind: 'select', options: currencies }, { key: 'notes', kind: 'textarea' },
  ], columns: ['quote_number', 'account_id', 'status', 'issue_date', 'expiration_date', 'total', 'currency'], statuses: quoteStatuses },
  { entity: 'orders', label: '订单', en: 'Orders', icon: Purchase, fields: [
    { key: 'order_number', required: true }, { key: 'account_id', kind: 'reference', reference: 'accounts', nullable: true }, { key: 'quote_id', kind: 'reference', reference: 'quotes', nullable: true }, { key: 'status', kind: 'select', options: orderStatuses },
    { key: 'order_date', kind: 'date' }, { key: 'requested_delivery_date', kind: 'date' }, { key: 'subtotal', kind: 'number' },
    { key: 'tax', kind: 'number' }, { key: 'total', kind: 'number' }, { key: 'currency', kind: 'select', options: currencies },
    { key: 'payment_status', kind: 'select', options: options(['unpaid', '未付款', 'Unpaid'], ['partial', '部分付款', 'Partial'], ['paid', '已付款', 'Paid'], ['overdue', '逾期', 'Overdue']) },
  ], columns: ['order_number', 'account_id', 'status', 'order_date', 'total', 'payment_status'], statuses: orderStatuses },
  { entity: 'deliveries', label: '交付', en: 'Deliveries', icon: DeliveryIcon, fields: [
    { key: 'delivery_number', required: true }, { key: 'order_id', kind: 'reference', reference: 'orders', required: true }, { key: 'status', kind: 'select', options: deliveryStatuses },
    { key: 'carrier' }, { key: 'tracking_number' }, { key: 'shipped_at', kind: 'date', nullable: true }, { key: 'delivered_at', kind: 'date', nullable: true }, { key: 'delivery_address', kind: 'textarea' },
  ], columns: ['delivery_number', 'order_id', 'status', 'carrier', 'tracking_number', 'shipped_at'], statuses: deliveryStatuses },
  { entity: 'payments', label: '收款', en: 'Payments', icon: Currency, fields: [
    { key: 'payment_number', required: true }, { key: 'order_id', kind: 'reference', reference: 'orders', required: true }, { key: 'amount', kind: 'number', required: true }, { key: 'currency', kind: 'select', options: currencies },
    { key: 'payment_date', kind: 'date' }, { key: 'method', kind: 'select', options: options(['bank_transfer', '银行转账', 'Bank transfer'], ['credit_card', '信用卡', 'Credit card'], ['cash', '现金', 'Cash'], ['other', '其他', 'Other']) },
    { key: 'status', kind: 'select', options: paymentStatuses }, { key: 'reference' }, { key: 'notes', kind: 'textarea' },
  ], columns: ['payment_number', 'order_id', 'amount', 'currency', 'payment_date', 'method', 'status'], statuses: paymentStatuses },
];

const labels: Record<string, [string, string]> = {
  name: ['名称', 'Name'], company: ['公司', 'Company'], title: ['职务', 'Title'], email: ['电子邮箱', 'Email'], phone: ['电话', 'Phone'],
  source: ['来源', 'Source'], status: ['状态', 'Status'], rating: ['评级', 'Rating'], notes: ['备注', 'Notes'],
  account_number: ['客户编号', 'Customer number'], type: ['类型', 'Type'], industry: ['行业', 'Industry'], website: ['网站', 'Website'],
  billing_city: ['账单城市', 'Billing city'], billing_country: ['账单国家/地区', 'Billing country'],
  first_name: ['名', 'First name'], last_name: ['姓', 'Last name'], account_id: ['客户', 'Customer'], department: ['部门', 'Department'],
  is_primary: ['主要联系人', 'Primary contact'], contact_id: ['联系人', 'Contact'], stage: ['销售阶段', 'Sales stage'], amount: ['金额', 'Amount'],
  probability: ['赢单概率 (%)', 'Probability (%)'], close_date: ['预计成交日期', 'Close date'], lead_source: ['机会来源', 'Lead source'], description: ['描述', 'Description'],
  quote_number: ['报价编号', 'Quote number'], opportunity_id: ['销售机会', 'Opportunity'], issue_date: ['报价日期', 'Issue date'],
  expiration_date: ['有效期至', 'Expiration date'], subtotal: ['小计', 'Subtotal'], tax: ['税额', 'Tax'], total: ['总额', 'Total'], currency: ['币种', 'Currency'],
  order_number: ['订单编号', 'Order number'], quote_id: ['报价', 'Quote'], order_date: ['订单日期', 'Order date'],
  requested_delivery_date: ['要求交付日期', 'Requested delivery'], payment_status: ['付款状态', 'Payment status'],
  delivery_number: ['交付编号', 'Delivery number'], order_id: ['订单', 'Order'], carrier: ['承运商', 'Carrier'],
  tracking_number: ['物流单号', 'Tracking number'], shipped_at: ['发货日期', 'Shipped at'], delivered_at: ['送达日期', 'Delivered at'], delivery_address: ['交付地址', 'Delivery address'],
  payment_number: ['收款编号', 'Payment number'], payment_date: ['收款日期', 'Payment date'], method: ['收款方式', 'Method'], reference: ['参考编号', 'Reference'],
};
const displayLabel = (key: string, lang: Lang) => labels[key]?.[lang === 'zh' ? 0 : 1] ?? key.replaceAll('_', ' ');
const moduleFor = (entity: CrmEntity) => modules.find((item) => item.entity === entity)!;
const enumLabels = new Map<string, FieldOption>(
  modules.flatMap((mod) => [
    ...(mod.statuses ?? []),
    ...mod.fields.flatMap((field) => field.options ?? []),
  ]).map((option) => [option.value, option]),
);
const displayEnumValue = (value: string, lang: Lang) => {
  const option = enumLabels.get(value);
  return option ? (lang === 'zh' ? option.zh : option.en) : value;
};
const titleFor = (record: CrmRecord) => {
  const name = [record.data.first_name, record.data.last_name].filter(Boolean).join(' ');
  const value = record.data.name ?? record.data.quote_number ?? record.data.order_number ?? record.data.delivery_number ?? record.data.payment_number ?? name;
  return String(value || record.id);
};
const formatAmount = (value: unknown, currency = 'CNY', lang: Lang = 'zh') => {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) return '—';
  const locale = lang === 'zh' ? 'zh-CN' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: /^[A-Z]{3}$/.test(currency) ? currency : 'CNY',
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat(locale, { style: 'decimal', maximumFractionDigits: 2 }).format(amount);
  }
};
const queryClient = new QueryClient();

function AppShell({ children, lang, setLang, onSignOut }: { children: ReactNode; lang: Lang; setLang: (lang: Lang) => void; onSignOut: () => void }) {
  const [path, setLocation] = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const label = (zh: string, en: string) => lang === 'zh' ? zh : en;
  const currentModule = modules.find((m) => path.startsWith(`/${m.entity}`));
  const go = (href: string) => { setLocation(href); setNavOpen(false); setProfileOpen(false); setSearchOpen(false); setNotificationOpen(false); };
  const submitGlobalSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchOpen(false);
    if (globalSearch.trim()) setLocation(`/leads?search=${encodeURIComponent(globalSearch.trim())}`);
  };
  return <div className="app-shell">
    {navOpen && <button className="sidebar-scrim" aria-label={label('关闭侧边栏', 'Close navigation')} onClick={() => setNavOpen(false)} />}
    <aside className={`side-nav ${navOpen ? 'open' : ''}`} data-testid="navigation-sidebar" aria-hidden={!navOpen}>
      <nav className="nav-links nav-primary">
        <Link href="/" onClick={() => setNavOpen(false)} className={`nav-link ${path === '/' ? 'active' : ''}`} data-testid="link-dashboard"><DashboardIcon />{label('总览', 'Overview')}</Link>
      </nav>
      <div className="nav-section">{label('客户与销售', 'Customer & sales')}</div>
      <nav className="nav-links">
        {modules.slice(0, 4).map((mod) => { const Icon = mod.icon; const active = path.startsWith(`/${mod.entity}`); return <Link href={`/${mod.entity}`} onClick={() => setNavOpen(false)} key={mod.entity} className={`nav-link ${active ? 'active' : ''}`} data-testid={`link-module-${mod.entity}`}><Icon />{lang === 'zh' ? mod.label : mod.en}</Link>; })}
      </nav>
      <div className="nav-section">{label('订单履约', 'Order fulfillment')}</div>
      <nav className="nav-links">
        {modules.slice(4).map((mod) => { const Icon = mod.icon; const active = path.startsWith(`/${mod.entity}`); return <Link href={`/${mod.entity}`} onClick={() => setNavOpen(false)} key={mod.entity} className={`nav-link ${active ? 'active' : ''}`} data-testid={`link-module-${mod.entity}`}><Icon />{lang === 'zh' ? mod.label : mod.en}</Link>; })}
      </nav>
    </aside>
    <div className="main-area">
      <header className="topbar" data-testid="app-header">
        <div className="topbar-left">
          <Button className="header-menu-button" kind="ghost" size="sm" hasIconOnly renderIcon={Menu} iconDescription={label('展开或隐藏侧边栏', 'Toggle navigation')} onClick={() => setNavOpen((open) => !open)} data-testid="button-mobile-menu" />
          <div className="header-brand" aria-label="cosmos Cortex">cosmos <strong>Cortex</strong></div>
        </div>
        <div className="topbar-right">
          <div className="header-popover-anchor">
            <Button className="header-action" kind="ghost" size="sm" hasIconOnly renderIcon={SearchIcon} iconDescription={label('打开搜索', 'Open search')} onClick={() => { setSearchOpen((open) => !open); setNotificationOpen(false); setProfileOpen(false); }} data-testid="button-header-search" />
            {searchOpen && <form className="header-popover header-search-popover" role="search" onSubmit={submitGlobalSearch}>
              <Search size="lg" labelText={label('全局搜索', 'Global search')} placeholder={label('搜索潜在客户...', 'Search leads...')} value={globalSearch} onChange={(event) => setGlobalSearch(event.currentTarget.value)} data-testid="input-global-search" />
              <div className="header-popover-hint">{label('按 Enter 搜索潜在客户', 'Press Enter to search leads')}</div>
            </form>}
          </div>
          <div className="header-popover-anchor">
            <Button className="header-action" kind="ghost" size="sm" hasIconOnly renderIcon={Notification} iconDescription={label('查看通知', 'View notifications')} onClick={() => { setNotificationOpen((open) => !open); setSearchOpen(false); setProfileOpen(false); }} data-testid="button-header-messages" />
            {notificationOpen && <div className="header-popover notification-popover" role="status">
              <div className="header-popover-title">{label('通知', 'Notifications')}</div>
              <div className="header-notification-empty">{label('目前没有新通知', 'You’re all caught up')}</div>
            </div>}
          </div>
          <div className="profile-control">
            <Button className="header-avatar" kind="ghost" size="sm" hasIconOnly renderIcon={UserAvatar} iconDescription={label('用户菜单', 'User menu')} onClick={() => { setProfileOpen((open) => !open); setSearchOpen(false); setNotificationOpen(false); }} data-testid="button-user-avatar" />
            {profileOpen && <div className="profile-menu" role="menu">
              <div className="profile-menu-label">{label('已登录用户', 'Signed-in user')}</div>
              <Button kind="ghost" size="sm" className="profile-menu-item" onClick={() => { setLang(lang === 'zh' ? 'en' : 'zh'); setProfileOpen(false); }}>{lang === 'zh' ? 'Switch to English' : '切换到简体中文'}</Button>
              <Button kind="ghost" size="sm" className="profile-menu-item" renderIcon={Logout} onClick={() => { setProfileOpen(false); onSignOut(); }} data-testid="button-signout">{label('退出登录', 'Sign out')}</Button>
            </div>}
          </div>
        </div>
      </header>
      <main className="content" onClick={() => { if (profileOpen) setProfileOpen(false); if (searchOpen) setSearchOpen(false); if (notificationOpen) setNotificationOpen(false); }}>{children}</main>
    </div>
  </div>;
}

function Dashboard({ lang }: { lang: Lang }) {
  const { data, isLoading, isError, refetch } = useGetDashboard();
  const [, setLocation] = useLocation();
  const zh = lang === 'zh';
  const items = data?.monthly_revenue ?? [];
  const maxRevenue = Math.max(1, ...items.map((item) => item.amount));
  const kpis: [string, string, string][] = [
    [zh ? '潜在客户' : 'Leads', String(data?.lead_count ?? '—'), zh ? `已合格 ${data?.qualified_lead_count ?? '—'}` : `${data?.qualified_lead_count ?? '—'} qualified`],
    [zh ? '开放销售机会' : 'Open opportunities', String(data?.open_opportunity_count ?? '—'), `${zh ? '销售管道' : 'Pipeline'} · ${formatAmount(data?.pipeline_value, 'CNY', lang)}`],
    [zh ? '加权销售管道' : 'Weighted pipeline', formatAmount(data?.weighted_pipeline_value, 'CNY', lang), zh ? '按赢单概率加权' : 'Weighted by probability'],
    [zh ? '已赢收入' : 'Won revenue', formatAmount(data?.won_revenue, 'CNY', lang), `${zh ? '未结余额' : 'Outstanding'} · ${formatAmount(data?.outstanding_balance, 'CNY', lang)}`],
    [zh ? '报价' : 'Quotes', String(data?.quote_count ?? '—'), zh ? '当前记录总数' : 'Current record count'],
    [zh ? '开放订单' : 'Open orders', String(data?.open_order_count ?? '—'), `${zh ? '待发货' : 'To ship'} · ${data?.orders_to_ship ?? '—'}`],
  ];
  return <div data-testid="page-dashboard">
    <div className="page-heading"><div><div className="eyebrow">{zh ? '收入运营 · 工作台' : 'REVENUE OPERATIONS · WORKSPACE'}</div><h1>{zh ? '业务总览' : 'Business overview'}</h1><p>{zh ? '从销售线索到回款，一处掌握业务进展。' : 'One view of progress from first lead to final payment.'}</p></div><div className="page-actions"><Button kind="tertiary" size="sm" renderIcon={SearchIcon} onClick={() => setLocation('/leads')} data-testid="button-open-leads">{zh ? '查看潜在客户' : 'View leads'}</Button></div></div>
    {isLoading ? <div className="dashboard-grid">{Array.from({ length: 6 }, (_, i) => <div className="kpi-card" key={i}><SkeletonText width="50%" /><SkeletonText heading width="65%" /></div>)}</div> : isError ? <div><InlineNotification kind="error" title={zh ? '总览暂时无法加载' : 'Dashboard unavailable'} subtitle={zh ? '请检查连接后重试。' : 'Check your connection and retry.'} /><Button kind="ghost" size="sm" onClick={() => refetch()} data-testid="button-retry-dashboard">{zh ? '重试' : 'Retry'}</Button></div> : <>
      <div className="dashboard-grid">{kpis.map(([label, value, note], i) => <article className="kpi-card" key={label} data-testid={`kpi-card-${i}`}><div className="kpi-label">{label}</div><div className="kpi-value" data-testid={`kpi-value-${i}`}>{value}</div><div className="kpi-note">{note}</div></article>)}</div>
      <div className="dashboard-lower">
        <section className="section-panel"><div className="section-head"><h2>{zh ? '月度收入' : 'Monthly revenue'}</h2><span>{zh ? '按月份汇总' : 'By month'}</span></div>
          {items.length ? <div className="chart" data-testid="chart-monthly-revenue">{items.map((item, index) => <div className="chart-col" key={`${item.month}-${index}`} title={`${item.month}: ${formatAmount(item.amount, 'CNY', lang)}`} data-testid={`chart-month-${index}`}><div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max(2, (item.amount / maxRevenue) * 100)}%` }} /></div><div className="bar-label">{item.month}</div></div>)}</div> : <EmptyState zh={zh} title={zh ? '暂无收入记录' : 'No revenue data'} detail={zh ? '收入数据将在产生回款后显示。' : 'Revenue will appear when payments are recorded.'} />}
        </section>
        <section className="section-panel"><div className="section-head"><h2>{zh ? '机会阶段' : 'Opportunity stages'}</h2><span>{zh ? '销售管道' : 'Pipeline'}</span></div>
          {data?.opportunities_by_stage.length ? <div className="stage-list">{data.opportunities_by_stage.map((stage, index) => <div className="stage-row" key={`${stage.stage}-${index}`} data-testid={`stage-row-${index}`}><span className="stage-name">{displayEnumValue(stage.stage, lang)}</span><span className="stage-meta">{stage.count} · {formatAmount(stage.amount, 'CNY', lang)}</span></div>)}</div> : <EmptyState zh={zh} title={zh ? '暂无开放机会' : 'No opportunities yet'} detail={zh ? '创建销售机会后，阶段分布将在此显示。' : 'Stage distribution appears when opportunities are created.'} />}
        </section>
      </div>
      <section className="section-panel" style={{ marginTop: 14 }}><div className="section-head"><h2>{zh ? '最近更新' : 'Recently updated'}</h2><span>{zh ? '跨模块记录' : 'Across modules'}</span></div>
        {data?.recent_records.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>{zh ? '记录' : 'Record'}</th><th>{zh ? '模块' : 'Module'}</th><th>{zh ? '状态' : 'Status'}</th><th>{zh ? '更新时间' : 'Updated'}</th></tr></thead><tbody>{data.recent_records.map((record) => <tr key={`${record.entity}-${record.id}`} data-testid={`row-recent-${record.id}`}><td><Link className="record-link" href={`/${record.entity}/${record.id}`} data-testid={`link-recent-record-${record.id}`}>{titleFor(record)}</Link></td><td>{zh ? moduleFor(record.entity).label : moduleFor(record.entity).en}</td><td><StatusPill value={String(record.data.status ?? record.data.stage ?? '—')} lang={lang} /></td><td>{record.updated_at ? new Date(record.updated_at).toLocaleDateString(zh ? 'zh-CN' : 'en-US') : '—'}</td></tr>)}</tbody></table></div> : <EmptyState zh={zh} title={zh ? '暂无最近记录' : 'No recent records'} detail={zh ? '新建或更新业务记录后会显示在这里。' : 'New and updated business records will appear here.'} />}
      </section>
    </>}
  </div>;
}

function EmptyState({ zh, title, detail, action }: { zh: boolean; title: string; detail: string; action?: React.ReactNode }) {
  return <div className="empty-state" data-testid="state-empty"><div className="empty-mark"><SearchIcon size={21} /></div><h3>{title}</h3><p>{detail}</p>{action}</div>;
}

function StatusPill({ value, lang }: { value: string; lang: Lang }) {
  const lowered = value.toLowerCase();
  const tone = /won|paid|delivered|已收款|已送达|成交|已接受|已完成/.test(lowered) ? 'good' : /overdue|failed|lost|异常|失败|逾期|拒绝/.test(lowered) ? 'bad' : /pending|draft|新建|待|草稿|联系中/.test(lowered) ? 'warn' : '';
  return <span className={`status-pill ${tone}`} data-testid={`status-${value.replaceAll(' ', '-')}`}>{displayEnumValue(value, lang)}</span>;
}

function ResourcePage({ entity, lang }: { entity: CrmEntity; lang: Lang }) {
  const mod = moduleFor(entity);
  const params = useParams<{ id?: string }>();
  const id = params.id;
  const zh = lang === 'zh';
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('search') ?? '');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<'create' | 'edit' | 'delete' | null>(null);
  const [selected, setSelected] = useState<CrmRecord | null>(null);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const queryClient = useQueryClient();
  const listParams = useMemo(() => ({ entity, q: search || undefined, status: status || undefined, page, page_size: 20 }), [entity, search, status, page]);
  const list = useListCrmRecords(listParams);
  useEffect(() => {
    if (list.isError) {
      // Keep the original API failure visible for diagnosis; never log auth tokens.
      console.error('[cosmos Cortex] Failed to load CRM records', {
        entity,
        error: list.error,
        message: list.error instanceof Error ? list.error.message : String(list.error ?? 'Unknown error'),
      });
    }
  }, [entity, list.isError, list.error]);
  const detail = useGetCrmRecord(entity, id ?? '', { query: { enabled: !!id, queryKey: getGetCrmRecordQueryKey(entity, id ?? '') } });
  const accountsLookup = useListCrmRecords({ entity: 'accounts', page_size: 100 }, { query: { queryKey: getListCrmRecordsQueryKey({ entity: 'accounts', page_size: 100 }), enabled: mod.fields.some((field) => field.reference === 'accounts') } });
  const contactsLookup = useListCrmRecords({ entity: 'contacts', page_size: 100 }, { query: { queryKey: getListCrmRecordsQueryKey({ entity: 'contacts', page_size: 100 }), enabled: mod.fields.some((field) => field.reference === 'contacts') } });
  const opportunitiesLookup = useListCrmRecords({ entity: 'opportunities', page_size: 100 }, { query: { queryKey: getListCrmRecordsQueryKey({ entity: 'opportunities', page_size: 100 }), enabled: mod.fields.some((field) => field.reference === 'opportunities') } });
  const quotesLookup = useListCrmRecords({ entity: 'quotes', page_size: 100 }, { query: { queryKey: getListCrmRecordsQueryKey({ entity: 'quotes', page_size: 100 }), enabled: mod.fields.some((field) => field.reference === 'quotes') } });
  const ordersLookup = useListCrmRecords({ entity: 'orders', page_size: 100 }, { query: { queryKey: getListCrmRecordsQueryKey({ entity: 'orders', page_size: 100 }), enabled: mod.fields.some((field) => field.reference === 'orders') } });
  const referenceRecords: Partial<Record<CrmEntity, CrmRecord[]>> = {
    accounts: accountsLookup.data?.items ?? [],
    contacts: contactsLookup.data?.items ?? [],
    opportunities: opportunitiesLookup.data?.items ?? [],
    quotes: quotesLookup.data?.items ?? [],
    orders: ordersLookup.data?.items ?? [],
  };
  const createMutation = useCreateCrmRecord();
  const updateMutation = useUpdateCrmRecord();
  const deleteMutation = useDeleteCrmRecord();
  const [, setLocation] = useLocation();
  const invalidate = async (recordId?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListCrmRecordsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }),
      recordId ? queryClient.invalidateQueries({ queryKey: getGetCrmRecordQueryKey(entity, recordId) }) : Promise.resolve(),
    ]);
  };
  const beginCreate = () => { setSelected(null); setFormValues({}); setModal('create'); };
  const beginEdit = (record: CrmRecord) => {
    const initialValues = { ...record.data };
    for (const field of mod.fields) {
      if (field.kind === 'date' && initialValues[field.key]) {
        initialValues[field.key] = String(initialValues[field.key]).slice(0, 10);
      }
    }
    setSelected(record);
    setFormValues(initialValues);
    setModal('edit');
  };
  const submitForm = (event: FormEvent) => {
    event.preventDefault();
    const data: Record<string, unknown> = {};
    for (const field of mod.fields) {
      const value = formValues[field.key];
      const isEmpty = value === '' || value === null || value === undefined;
      if (field.kind === 'checkbox') {
        data[field.key] = Boolean(value);
        continue;
      }
      if (isEmpty) {
        if (modal === 'edit' && field.nullable) data[field.key] = null;
        else if (modal === 'edit' && field.kind !== 'number' && field.kind !== 'date' && field.kind !== 'reference') data[field.key] = '';
        continue;
      }
      if (field.kind === 'number') {
        const number = Number(value);
        if (!Number.isFinite(number)) return;
        data[field.key] = number;
      } else {
        data[field.key] = value;
      }
    }
    if (modal === 'edit' && selected) {
      updateMutation.mutate({ entity, id: selected.id, data: { data } }, { onSuccess: async () => { setModal(null); await invalidate(selected.id); } });
    } else {
      createMutation.mutate({ data: { data }, params: { entity } }, { onSuccess: async (record) => { setModal(null); await invalidate(record.id); } });
    }
  };
  const confirmDelete = () => {
    if (!selected) return;
    deleteMutation.mutate({ entity, id: selected.id }, { onSuccess: async () => { setModal(null); setSelected(null); await invalidate(id); if (id) setLocation(`/${entity}`); } });
  };
  const record = id ? detail.data : null;
  const heading = zh ? mod.label : mod.en;
  const valueFor = (rec: CrmRecord, key: string) => {
    const value = rec.data[key];
    if (value === true) return zh ? '是' : 'Yes';
    if (value === false) return zh ? '否' : 'No';
    if (value === null || value === undefined || value === '') return '—';
    if (['amount', 'total', 'subtotal', 'tax'].includes(key)) return formatAmount(value, String(rec.data.currency ?? 'CNY'), lang);
    if (key === 'probability') return `${value}%`;
    const field = mod.fields.find((candidate) => candidate.key === key);
    if (field?.reference) {
      const match = (referenceRecords[field.reference] ?? []).find((related) => related.id === value);
      return match ? titleFor(match) : `${String(value).slice(0, 8)}…`;
    }
    return key === 'currency' ? String(value) : displayEnumValue(String(value), lang);
  };
  return <div data-testid={`page-${entity}`}>
    {!id ? <>
      <div className="page-heading"><div><div className="eyebrow">{zh ? '客户关系管理' : 'CUSTOMER RELATIONSHIP MANAGEMENT'}</div><h1>{heading}</h1><p>{zh ? '检索并维护完整的客户业务记录。' : 'Find and maintain your customer business records.'}</p></div><div className="page-actions"><Button kind="primary" size="md" renderIcon={Add} onClick={beginCreate} data-testid={`button-create-${entity}`}>{zh ? '新建记录' : 'Create record'}</Button></div></div>
      <section className="panel">
        <div className="toolbar"><Search size="md" placeholder={zh ? `搜索${heading}...` : `Search ${mod.en.toLowerCase()}...`} labelText={zh ? '搜索记录' : 'Search records'} value={search} onChange={(event) => { setSearch(event.currentTarget.value); setPage(1); }} data-testid={`input-search-${entity}`} />
          {mod.statuses ? <Dropdown id={`filter-status-${entity}`} titleText={zh ? '状态筛选' : 'Filter status'} label={status ? (mod.statuses.find((option) => option.value === status) ? (zh ? mod.statuses.find((option) => option.value === status)!.zh : mod.statuses.find((option) => option.value === status)!.en) : status) : (zh ? '所有状态' : 'All statuses')} items={[{ id: '', label: zh ? '所有状态' : 'All statuses' }, ...mod.statuses.map((option) => ({ id: option.value, label: zh ? option.zh : option.en }))]} itemToString={(item) => item?.label ?? ''} selectedItem={status ? (mod.statuses.find((option) => option.value === status) ? { id: status, label: zh ? mod.statuses.find((option) => option.value === status)!.zh : mod.statuses.find((option) => option.value === status)!.en } : null) : { id: '', label: zh ? '所有状态' : 'All statuses' }} onChange={({ selectedItem }) => { setStatus(selectedItem?.id ?? ''); setPage(1); }} data-testid={`dropdown-filter-status-${entity}`} /> : <TextInput id={`filter-status-${entity}`} labelText={zh ? '状态筛选' : 'Filter status'} placeholder={zh ? '输入状态' : 'Enter status'} value={status} onChange={(event) => { setStatus(event.currentTarget.value); setPage(1); }} data-testid={`input-filter-status-${entity}`} />}
          <span style={{ marginLeft: 'auto', color: '#62727d', fontSize: 11 }} data-testid={`text-record-count-${entity}`}>{list.data ? `${list.data.total} ${zh ? '条记录' : 'records'}` : ''}</span>
        </div>
        {list.isLoading ? <div style={{ padding: 14 }} data-testid="state-loading">{Array.from({ length: 8 }, (_, i) => <div className="skeleton-row" key={i} />)}</div> :
          list.isError ? <div className="error-state" data-testid="state-error"><InlineNotification kind="error" title={zh ? '记录加载失败' : 'Could not load records'} subtitle={`${zh ? '原始错误：' : 'Raw error: '}${list.error instanceof Error ? list.error.message : String(list.error ?? 'Unknown error')}`} /><Button kind="ghost" size="sm" onClick={() => list.refetch()} data-testid="button-retry-list">{zh ? '重试' : 'Retry'}</Button></div> :
          !list.data?.items.length ? <EmptyState zh={zh} title={zh ? '还没有记录' : 'No records yet'} detail={search || status ? (zh ? '请调整搜索条件或筛选状态。' : 'Try changing your search or status filter.') : (zh ? `创建第一条${heading}记录，开始追踪业务进展。` : `Create your first ${mod.en.toLowerCase()} record to get started.`)} action={!search && !status ? <Button kind="tertiary" size="sm" renderIcon={Add} onClick={beginCreate} data-testid={`button-empty-create-${entity}`}>{zh ? '创建记录' : 'Create record'}</Button> : undefined} /> :
          <>
            <div className="table-wrap desktop-record-table">
              <table className="data-table">
                <thead><tr>{mod.columns.map((key) => <th key={key}>{displayLabel(key, lang)}</th>)}<th>{zh ? '操作' : 'Actions'}</th></tr></thead>
                <tbody>{list.data.items.map((item) => (
                  <tr key={item.id} data-testid={`row-${entity}-${item.id}`}>
                    {mod.columns.map((key, index) => (
                      <td key={key}>
                        {index === 0
                          ? <Link href={`/${entity}/${item.id}`} className="record-link" data-testid={`link-record-${item.id}`}>{valueFor(item, key)}</Link>
                          : key === 'status' || key === 'stage' || key === 'payment_status'
                            ? <StatusPill value={String(item.data[key] ?? '—')} lang={lang} />
                            : valueFor(item, key)}
                      </td>
                    ))}
                    <td><div className="row-actions">
                      <Button kind="ghost" size="sm" hasIconOnly renderIcon={Edit} iconDescription={zh ? '编辑' : 'Edit'} onClick={() => beginEdit(item)} data-testid={`button-edit-${item.id}`} />
                      <Button kind="ghost" size="sm" hasIconOnly renderIcon={TrashCan} iconDescription={zh ? '删除' : 'Delete'} onClick={() => { setSelected(item); setModal('delete'); }} data-testid={`button-delete-${item.id}`} />
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="mobile-card-list" role="list" aria-label={zh ? `${heading}卡片列表` : `${mod.en} card list`} data-testid={`mobile-card-list-${entity}`}>
              {list.data.items.map((item) => {
                const titleKey = mod.columns[0];
                const statusKey = mod.columns.find((key) => ['status', 'stage', 'payment_status'].includes(key));
                const bodyKey = mod.columns.find((key) => key !== titleKey && key !== statusKey);
                const cardTitle = String(valueFor(item, titleKey) ?? (zh ? '未命名记录' : 'Untitled record'));
                const cardBody = bodyKey ? String(valueFor(item, bodyKey) ?? '') : '';
                const purpose = zh ? `打开${heading}记录：${cardTitle}` : `Open ${mod.en} record: ${cardTitle}`;
                return <Link key={item.id} href={`/${entity}/${item.id}`} className="mobile-record-card" role="listitem" aria-label={purpose} data-testid={`mobile-card-${entity}-${item.id}`}>
                  <div className="mobile-record-card-content">
                    <div className="mobile-record-card-eyebrow">{displayLabel(titleKey, lang)}</div>
                    <div className="mobile-record-card-heading">{cardTitle}</div>
                    {cardBody && <div className="mobile-record-card-body">{displayLabel(bodyKey!, lang)}: {cardBody}</div>}
                    {statusKey && <div className="mobile-record-card-status"><Tag className={entity === 'quotes' && item.data[statusKey] === 'accepted' ? 'quote-card-status quote-card-status-accepted' : 'quote-card-status'} type={entity === 'quotes' && item.data[statusKey] === 'accepted' ? 'green' : 'gray'}>{displayEnumValue(String(item.data[statusKey] ?? '—'), lang)}</Tag></div>}
                  </div>
                  <ChevronRight className="mobile-record-card-chevron" size={20} aria-hidden="true" />
                </Link>;
              })}
            </div>
            <div className="pagination"><span>{zh ? `第 ${list.data.page} 页，共 ${list.data.total} 条记录` : `Page ${list.data.page} · ${list.data.total} records`}</span><div className="page-actions"><Button kind="tertiary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} data-testid="button-previous-page">{zh ? '上一页' : 'Previous'}</Button><Button kind="tertiary" size="sm" disabled={page * list.data.page_size >= list.data.total} onClick={() => setPage(page + 1)} data-testid="button-next-page">{zh ? '下一页' : 'Next'}</Button></div></div></>}
      </section>
    </> : <>{detail.isLoading ? <div data-testid="state-loading-detail"><SkeletonText heading width="30%" /><SkeletonText paragraph lineCount={6} /></div> : detail.isError || !record ? <div className="error-state" data-testid="state-detail-error"><InlineNotification kind="error" title={zh ? '无法加载记录' : 'Record unavailable'} subtitle={zh ? '记录可能已删除，或暂时无法连接。' : 'It may have been deleted or the service is unavailable.'} /><Link href={`/${entity}`} className="record-link" data-testid="link-back-to-list">{zh ? '返回列表' : 'Back to list'}</Link></div> : <>
      <div className="page-heading"><div><Link href={`/${entity}`} className="record-link" data-testid="link-back"><ArrowLeft size={14} /> {zh ? `返回${heading}` : `Back to ${heading}`}</Link><div className="eyebrow" style={{ marginTop: 12 }}>{zh ? '记录详情' : 'RECORD DETAIL'} · {record.id}</div><h1>{titleFor(record)}</h1><p>{zh ? `创建于 ${new Date(record.created_at).toLocaleString('zh-CN')}` : `Created ${new Date(record.created_at).toLocaleString('en-US')}`}</p></div><div className="page-actions"><Button kind="tertiary" renderIcon={Edit} onClick={() => beginEdit(record)} data-testid="button-detail-edit">{zh ? '编辑' : 'Edit'}</Button><Button kind="danger--tertiary" renderIcon={TrashCan} onClick={() => { setSelected(record); setModal('delete'); }} data-testid="button-detail-delete">{zh ? '删除' : 'Delete'}</Button></div></div>
      <div className="detail-layout"><section className="detail-card"><div className="detail-card-header"><h2>{zh ? '业务信息' : 'Business information'}</h2>{record.data.status || record.data.stage ? <StatusPill value={String(record.data.status ?? record.data.stage)} lang={lang} /> : null}</div><div className="detail-grid">{mod.fields.map((field) => <div className="detail-field" key={field.key} data-testid={`detail-field-${field.key}`}><div className="detail-label">{displayLabel(field.key, lang)}</div><div className="detail-value">{valueFor(record, field.key)}</div></div>)}</div></section>
        <aside className="metadata"><strong>{zh ? '记录信息' : 'Record information'}</strong><div>{zh ? '记录 ID' : 'Record ID'}: {record.id}</div><div style={{ marginTop: 10 }}>{zh ? '创建时间' : 'Created'}: {new Date(record.created_at).toLocaleString(zh ? 'zh-CN' : 'en-US')}</div><div style={{ marginTop: 10 }}>{zh ? '最近更新' : 'Last updated'}: {new Date(record.updated_at).toLocaleString(zh ? 'zh-CN' : 'en-US')}</div></aside>
      </div></>}</>}
    <Modal open={modal === 'create' || modal === 'edit'} modalHeading={modal === 'create' ? (zh ? `新建${heading}` : `Create ${mod.en.slice(0, -1)}`) : (zh ? `编辑${heading}` : `Edit ${mod.en.slice(0, -1)}`)} primaryButtonText={zh ? '保存' : 'Save'} secondaryButtonText={zh ? '取消' : 'Cancel'} onRequestClose={() => setModal(null)} onRequestSubmit={() => (document.getElementById('record-form') as HTMLFormElement | null)?.requestSubmit()} primaryButtonDisabled={createMutation.isPending || updateMutation.isPending} data-testid="modal-record-form">
      <form onSubmit={submitForm} id="record-form">
        <div className="form-grid">
          {mod.fields.map((field) => {
            const fieldValue = String(formValues[field.key] ?? '');
            const setFieldValue = (value: unknown) => setFormValues((current) => ({ ...current, [field.key]: value }));
            const label = displayLabel(field.key, lang);
            const relationOptions = field.reference ? referenceRecords[field.reference] ?? [] : [];
            return <div key={field.key} className={field.kind === 'textarea' ? 'full-span' : ''}>
              {field.kind === 'textarea' ? <TextArea id={`field-${field.key}`} labelText={label} required={field.required} value={fieldValue} onChange={(event) => setFieldValue(event.currentTarget.value)} rows={3} data-testid={`input-${field.key}`} /> :
                field.kind === 'select' ? <Dropdown id={`field-${field.key}`} titleText={label} label={field.options?.find((option) => option.value === fieldValue) ? (zh ? field.options.find((option) => option.value === fieldValue)!.zh : field.options.find((option) => option.value === fieldValue)!.en) : (zh ? '请选择' : 'Select')} items={[{ id: '', label: zh ? '请选择' : 'Select' }, ...(field.options ?? []).map((option) => ({ id: option.value, label: zh ? option.zh : option.en }))]} itemToString={(item) => item?.label ?? ''} selectedItem={fieldValue ? (field.options?.find((option) => option.value === fieldValue) ? { id: fieldValue, label: zh ? field.options.find((option) => option.value === fieldValue)!.zh : field.options.find((option) => option.value === fieldValue)!.en } : null) : { id: '', label: zh ? '请选择' : 'Select' }} onChange={({ selectedItem }) => setFieldValue(selectedItem?.id ?? '')} required={field.required} data-testid={`dropdown-${field.key}`} /> :
                  field.kind === 'reference' ? <Dropdown id={`field-${field.key}`} titleText={label} label={relationOptions.find((related) => related.id === fieldValue) ? `${titleFor(relationOptions.find((related) => related.id === fieldValue)!)} · ${fieldValue.slice(0, 6)}` : (zh ? '请选择' : 'Select')} items={[{ id: '', label: zh ? '请选择' : 'Select' }, ...relationOptions.map((related) => ({ id: related.id, label: `${titleFor(related)} · ${related.id.slice(0, 6)}` }))]} itemToString={(item) => item?.label ?? ''} selectedItem={fieldValue ? (relationOptions.find((related) => related.id === fieldValue) ? { id: fieldValue, label: `${titleFor(relationOptions.find((related) => related.id === fieldValue)!)} · ${fieldValue.slice(0, 6)}` } : null) : { id: '', label: zh ? '请选择' : 'Select' }} onChange={({ selectedItem }) => setFieldValue(selectedItem?.id ?? '')} required={field.required} data-testid={`dropdown-${field.key}`} /> :
                    field.kind === 'checkbox' ? <Checkbox id={`field-${field.key}`} labelText={label} checked={Boolean(formValues[field.key])} onChange={(_, { checked }) => setFieldValue(checked)} data-testid={`checkbox-${field.key}`} /> :
                      field.kind === 'date' ? <DatePicker datePickerType="single" dateFormat="Y-m-d" onChange={(dates) => { const date = dates[0]; if (date instanceof Date && !Number.isNaN(date.getTime())) setFieldValue(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`); else setFieldValue(''); }}><DatePickerInput id={`field-${field.key}`} labelText={label} placeholder="YYYY-MM-DD" value={fieldValue} onChange={(event) => setFieldValue(event.currentTarget.value)} required={field.required} /></DatePicker> :
                      <TextInput id={`field-${field.key}`} type={field.kind === 'number' ? 'number' : field.kind === 'email' ? 'email' : field.kind === 'tel' ? 'tel' : 'text'} labelText={label} required={field.required} min={field.key === 'amount' && entity === 'payments' ? 0.01 : ['probability', 'amount', 'total', 'subtotal', 'tax'].includes(field.key) ? 0 : undefined} max={field.key === 'probability' ? 100 : undefined} step={field.kind === 'number' ? '0.01' : undefined} value={fieldValue} onChange={(event) => setFieldValue(event.currentTarget.value)} data-testid={`input-${field.key}`} />}
            </div>;
          })}
        </div>
      </form>
      {(createMutation.isError || updateMutation.isError) && <InlineNotification kind="error" title={zh ? '保存失败' : 'Save failed'} subtitle={zh ? '请检查数据后重试。' : 'Check the values and try again.'} />}
      {(createMutation.isPending || updateMutation.isPending) && <InlineLoading description={zh ? '正在保存…' : 'Saving…'} />}
    </Modal>
    <Modal open={modal === 'delete'} danger modalHeading={zh ? '删除记录' : 'Delete record'} primaryButtonText={deleteMutation.isPending ? (zh ? '正在删除…' : 'Deleting…') : (zh ? '删除' : 'Delete')} secondaryButtonText={zh ? '取消' : 'Cancel'} onRequestClose={() => setModal(null)} onRequestSubmit={confirmDelete} primaryButtonDisabled={deleteMutation.isPending} data-testid="modal-confirm-delete">
      <p className="delete-copy">{zh ? `确定删除「${selected ? titleFor(selected) : ''}」吗？此操作无法撤销。` : `Delete “${selected ? titleFor(selected) : ''}”? This action cannot be undone.`}</p>{deleteMutation.isError && <InlineNotification kind="error" title={zh ? '删除失败' : 'Delete failed'} subtitle={zh ? '请稍后重试。' : 'Please try again.'} />}
    </Modal>
  </div>;
}

function LoginPage({ lang, setLang, onSignIn }: { lang: Lang; setLang: (lang: Lang) => void; onSignIn?: (credentials: { email: string; password: string }) => void | Promise<void> }) {
  const zh = lang === 'zh';
  const [mode, setMode] = useState<'email' | 'username'>('email');
  const [identifier, setIdentifier] = useState('');
  const [resolvedEmail, setResolvedEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'identifier' | 'password'>('identifier');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const resolveAccount = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    const value = identifier.trim();
    if (mode === 'email') {
      // Let Supabase Auth verify the email/password pair. Do not require an
      // admin-only account lookup before a normal email sign-in.
      setResolvedEmail(value);
      setStep('password');
      return;
    }
    setPending(true);
    try {
      const response = await fetch('/api/auth/resolve-account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: value, mode }) });
      const result = await response.json() as { exists?: boolean };
      if (!response.ok || !result.exists) throw new Error('Account not found');
      setResolvedEmail('');
      setStep('password');
    } catch { setError(zh ? '无法验证此账户。请检查输入，或稍后重试。' : 'We could not verify this account. Check the entry or try again later.'); }
    finally { setPending(false); }
  };
  const submitPassword = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setPending(true);
    try {
      if (mode === 'username') {
        const response = await fetch('/api/auth/sign-in-username', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: identifier.trim(), password }) });
        const result = await response.json() as { access_token?: string; refresh_token?: string };
        if (!response.ok || !result.access_token || !result.refresh_token || !supabase) throw new Error('Sign-in failed');
        const { error: sessionError } = await supabase.auth.setSession({ access_token: result.access_token, refresh_token: result.refresh_token });
        if (sessionError) throw sessionError;
      } else {
        await onSignIn?.({ email: resolvedEmail || identifier.trim(), password });
      }
    } catch { setError(zh ? '登录失败，请检查密码后重试。' : 'Sign-in failed. Check your password and try again.'); }
    finally { setPending(false); }
  };
  const resetStep = () => { setStep('identifier'); setPassword(''); setError(''); };
  return <main className="login-screen" data-testid="page-login">
    <section className="login-primary">
      <div className="login-brand-row" aria-label="Cosmos Cortex">
        <div className="cosmos-brain-mark" aria-hidden="true"><svg viewBox="0 0 64 64" role="img" aria-label="Cosmos Cortex">
          <path d="M31.8 13.5c-2.1-5.2-9.5-5.8-13.2-1.7-3.1 3.4-2.8 7.1-1.2 9.7-5.1.8-8.2 5.2-7.1 10.2.5 2.2 1.8 4 3.7 5.1-3.1 3.2-2.8 8.4.8 11.2 2 1.6 4.5 2.1 6.9 1.5 1.4 4.6 6.4 7 10.2 4.6V13.5Z" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M32.2 13.5c2.1-5.2 9.5-5.8 13.2-1.7 3.1 3.4 2.8 7.1 1.2 9.7 5.1.8 8.2 5.2 7.1 10.2-.5 2.2-1.8 4-3.7 5.1 3.1 3.2 2.8 8.4-.8 11.2-2 1.6-4.5 2.1-6.9 1.5-1.4 4.6-6.4 7-10.2 4.6V13.5Z" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M22 19c4 1 5 4 4 7m-11 5c5-1 8 2 8 6m-2 10c3-2 6-1 8 2m13-30c-4 1-5 4-4 7m11 5c-5-1-8 2-8 6m2 10c-3-2-6-1-8 2M32 14v39" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
        </svg></div>
      </div>
      <div className="login-content">
        <h1>{zh ? <>登录到 Cosmos <strong>Cortex</strong></> : <>Sign in to Cosmos <strong>Cortex</strong></>}</h1>
        <p className="login-slogan">Think Like the Universe.</p>
        <div className="login-form">
          {step === 'identifier' ? <form onSubmit={resolveAccount}>
            <Dropdown
              id="login-mode"
              titleText={zh ? '登录方式' : 'Sign-in method'}
              label={mode === 'email' ? (zh ? '邮件地址登录' : 'Sign in with email') : (zh ? '管理员分配的账户登录' : 'Sign in with assigned account')}
              items={[
                { id: 'email' as const, label: zh ? '邮件地址登录' : 'Sign in with email' },
                { id: 'username' as const, label: zh ? '管理员分配的账户登录' : 'Sign in with assigned account' },
              ]}
              itemToString={(item) => item?.label ?? ''}
              selectedItem={{ id: mode, label: mode === 'email' ? (zh ? '邮件地址登录' : 'Sign in with email') : (zh ? '管理员分配的账户登录' : 'Sign in with assigned account') }}
              onChange={({ selectedItem }) => {
                if (!selectedItem) return;
                setMode(selectedItem.id);
                setIdentifier('');
                setError('');
              }}
            />
            <TextInput
              id="login-identifier"
              labelText={mode === 'email' ? (zh ? '电子邮箱' : 'Email address') : (zh ? '管理员分配的账户名' : 'Assigned account name')}
              type={mode === 'email' ? 'email' : 'text'}
              autoComplete="username"
              value={identifier}
              onChange={(event) => setIdentifier(event.currentTarget.value)}
              required
              autoFocus
            />
            {error && <div className="login-error" role="alert">{error}</div>}
            {pending
              ? <InlineLoading description={zh ? '正在检查账户…' : 'Checking account…'} />
              : <Button kind="primary" type="submit">{zh ? '继续' : 'Continue'}</Button>}
          </form> : <form onSubmit={submitPassword}>
            <div className="login-identity-summary"><div className="login-summary-label">{mode === 'email' ? (zh ? '电子邮箱' : 'Email address') : (zh ? '账户名' : 'Account name')}</div><div className="login-summary-value">{identifier}</div><Button kind="ghost" size="sm" type="button" onClick={resetStep}>{zh ? '更改' : 'Change'}</Button></div>
            <PasswordInput
              id="login-password"
              labelText={zh ? '密码' : 'Password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              required
              autoFocus
            />
            {error && <div className="login-error" role="alert">{error}</div>}
            {pending
              ? <InlineLoading description={zh ? '正在登录…' : 'Signing in…'} />
              : <Button kind="primary" type="submit">{zh ? '登录' : 'Sign in'}</Button>}
          </form>}
          <div className="login-contact">{zh ? '没有账户？' : 'No account?'} <a href="mailto:xg.y@outlook.com">{zh ? '联系我们' : 'Contact us'}</a></div>
        </div>
      </div>
      <footer className="login-copyright">© {new Date().getFullYear()} Cosmos Cortex. All rights reserved.</footer>
    </section>
    <aside className="login-secondary" aria-hidden="true" />
  </main>;
}

function Router({ lang, setLang, onSignIn, onSignOut }: { lang: Lang; setLang: (lang: Lang) => void; onSignIn?: (credentials: { email: string; password: string }) => void | Promise<void>; onSignOut: () => void }) {
  const [path] = useLocation();
  if (path === '/login') return <LoginPage lang={lang} setLang={setLang} onSignIn={onSignIn} />;
  return <AppShell lang={lang} setLang={setLang} onSignOut={onSignOut}><Switch>
    <Route path="/"><Dashboard lang={lang} /></Route>
    {modules.map((mod) => <Route key={`${mod.entity}-detail`} path={`/${mod.entity}/:id`}><ResourcePage entity={mod.entity} lang={lang} /></Route>)}
    {modules.map((mod) => <Route key={mod.entity} path={`/${mod.entity}`}><ResourcePage entity={mod.entity} lang={lang} /></Route>)}
    <Route><div className="empty-state"><h3>404</h3><p>{lang === 'zh' ? '页面不存在。' : 'This page could not be found.'}</p><Link href="/" className="record-link">{lang === 'zh' ? '返回总览' : 'Back to overview'}</Link></div></Route>
  </Switch></AppShell>;
}

function AuthRouter({ lang, setLang, onSignIn }: { lang: Lang; setLang: (lang: Lang) => void; onSignIn?: (credentials: { email: string; password: string }) => void | Promise<void> }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [path, setLocation] = useLocation();

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    const client = supabase;
    setAuthTokenGetter(async () => {
      const { data } = await client.auth.getSession();
      return data.session?.access_token ?? null;
    });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    void client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    }).catch(() => {
      setSession(null);
      setAuthReady(true);
    });

    return () => {
      subscription.unsubscribe();
      setAuthTokenGetter(null);
    };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (session && path === '/login') setLocation('/');
    if (!session && path !== '/login') setLocation('/login');
  }, [authReady, path, session, setLocation]);

  const handleSignIn = async (credentials: { email: string; password: string }) => {
    if (onSignIn) {
      await onSignIn(credentials);
      return;
    }
    if (!supabase) throw new Error('Supabase is not configured.');
    const { error } = await supabase.auth.signInWithPassword(credentials);
    if (error) throw error;
    queryClient.clear();
    setLocation('/');
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) return;
    queryClient.clear();
    setLocation('/login');
  };

  if (!supabaseConfigured || !supabase) {
    return <main className="content"><InlineNotification kind="error" title={lang === 'zh' ? 'Supabase 尚未配置' : 'Supabase is not configured'} subtitle={lang === 'zh' ? '请在部署环境中设置 Supabase URL 与匿名公钥。' : 'Set the Supabase URL and anon key in the deployment environment.'} /></main>;
  }
  if (!authReady || (session && path === '/login')) {
    return <main className="content"><InlineLoading description={lang === 'zh' ? '正在连接工作区…' : 'Connecting to workspace…'} /></main>;
  }
  if (!session) {
    return <LoginPage lang={lang} setLang={setLang} onSignIn={handleSignIn} />;
  }
  return <Router lang={lang} setLang={setLang} onSignOut={handleSignOut} />;
}

export default function App({ onSignIn }: { onSignIn?: (credentials: { email: string; password: string }) => void | Promise<void> }) {
  const [lang, setLang] = useState<Lang>('zh');
  return <QueryClientProvider client={queryClient}><div className="carbon-root"><AuthRouter lang={lang} setLang={setLang} onSignIn={onSignIn} /></div></QueryClientProvider>;
}
