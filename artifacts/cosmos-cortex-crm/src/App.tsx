import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Button, Checkbox, DatePicker, DatePickerInput, Dropdown, InlineLoading, InlineNotification,
  Modal, PasswordInput, Search, SkeletonText, Tag, TextArea, TextInput, Tile,
} from '@carbon/react';
import {
  Add, ArrowLeft, Building, ChartRelationship, Currency, Dashboard as DashboardIcon,
  Delivery as DeliveryIcon, Edit, Menu, Purchase, RequestQuote, Search as SearchIcon,
  Logout, Notification, TrashCan, UserAvatar, UserFollow, UserMultiple, ChevronRight,
} from '@carbon/icons-react';
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
import ContactsWorkspace from './components/contacts/ContactsWorkspace';
import AccountsWorkspace from './components/accounts/AccountsWorkspace';
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
  ['unqualified', '不合格', 'Unqualified'],
  ['converted', '已转化', 'Converted'],
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
  { entity: 'leads', label: '线索', en: 'Leads', icon: UserFollow, fields: [
    { key: 'name', required: true }, { key: 'company', required: true }, { key: 'title' }, { key: 'email', kind: 'email' }, { key: 'phone', kind: 'tel' },
    { key: 'country', required: true },
    { key: 'source', kind: 'select', required: true, options: options(['website', '官网表单', 'Website form'], ['event', '展会', 'Trade show'], ['outbound_email', '邮件开发', 'Outbound email'], ['social', '社交媒体', 'Social media'], ['marketplace', '平台询盘', 'Marketplace inquiry'], ['referral', '客户推荐', 'Referral'], ['phone', '电话', 'Phone'], ['other', '其他', 'Other']) },
    { key: 'status', kind: 'select', required: true, options: leadStatuses },
    { key: 'rating', kind: 'select', options: options(['hot', '热', 'Hot'], ['warm', '温', 'Warm'], ['cold', '冷', 'Cold']) },
    { key: 'product_interest' }, { key: 'estimated_amount', kind: 'number' }, { key: 'next_action', kind: 'date', nullable: true }, { key: 'last_follow_up', kind: 'date', nullable: true }, { key: 'notes', kind: 'textarea' },
  ], columns: ['name', 'company', 'country', 'status', 'source', 'rating'], statuses: leadStatuses },
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
  name: ['联系人姓名', 'Contact name'], company: ['公司名称', 'Company name'], title: ['职务', 'Title'], email: ['电子邮箱', 'Email'], phone: ['电话', 'Phone'], country: ['国家 / 地区', 'Country / region'], product_interest: ['产品兴趣', 'Product interest'], estimated_amount: ['预估金额', 'Estimated amount'], next_action: ['下次行动日期', 'Next action date'], last_follow_up: ['最近跟进', 'Last follow-up'],
  source: ['线索来源', 'Lead source'], status: ['线索状态', 'Lead status'], rating: ['线索评分', 'Lead rating'], notes: ['需求与跟进备注', 'Needs & follow-up notes'],
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
              <Search size="lg" labelText={label('全局搜索', 'Global search')} placeholder={label('搜索线索...', 'Search leads...')} value={globalSearch} onChange={(event) => setGlobalSearch(event.currentTarget.value)} data-testid="input-global-search" />
              <div className="header-popover-hint">{label('按 Enter 搜索线索', 'Press Enter to search leads')}</div>
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
  const { data, isLoading, isError, refetch, isFetching } = useGetDashboard();
  const [, setLocation] = useLocation();
  const zh = lang === 'zh';
  const [selectedMetric, setSelectedMetric] = useState('won');
  const [range, setRange] = useState('six');
  const [showAllInsights, setShowAllInsights] = useState(false);
  const [taskText, setTaskText] = useState('');
  const [tasks, setTasks] = useState<{ id: number; title: string; done: boolean }[]>([]);
  const items = data?.monthly_revenue ?? [];
  const visibleItems = range === 'three' ? items.slice(-3) : range === 'twelve' ? items.slice(-12) : items.slice(-6);
  const maxRevenue = Math.max(1, ...visibleItems.map((item) => item.amount));
  const stages = data?.opportunities_by_stage ?? [];
  const won = Number(data?.won_revenue ?? 0);
  const pipeline = Number(data?.pipeline_value ?? 0);
  const weighted = Number(data?.weighted_pipeline_value ?? 0);
  const outstanding = Number(data?.outstanding_balance ?? 0);
  const openOpps = Number(data?.open_opportunity_count ?? 0);
  const leads = Number(data?.lead_count ?? 0);
  const qualified = Number(data?.qualified_lead_count ?? 0);
  const kpis = [
    { id: 'won', label: zh ? '已成交金额' : 'Won revenue', value: data ? formatAmount(won, 'CNY', lang) : '—', note: zh ? '当前 CRM 汇总口径' : 'Current CRM summary', icon: Currency, route: '/orders' },
    { id: 'attainment', label: zh ? '目标达成率' : 'Quota attainment', value: '—', note: zh ? '尚未设置销售目标' : 'Target not configured', icon: ChartRelationship, route: '/opportunities' },
    { id: 'pipeline', label: zh ? '销售管道总额' : 'Pipeline value', value: data ? formatAmount(pipeline, 'CNY', lang) : '—', note: (data?.open_opportunity_count ?? '—') + (zh ? ' 个开放商机' : ' open deals'), icon: ChartRelationship, route: '/opportunities' },
    { id: 'forecast', label: zh ? '加权销售预测' : 'Weighted forecast', value: data ? formatAmount(weighted, 'CNY', lang) : '—', note: zh ? '按赢单概率加权' : 'Weighted by probability', icon: Currency, route: '/opportunities' },
    { id: 'winrate', label: zh ? '赢单率' : 'Win rate', value: '—', note: zh ? '需要赢单/丢单历史数据' : 'Won/lost history unavailable', icon: ChartRelationship, route: '/opportunities' },
    { id: 'deal', label: zh ? '平均成交金额' : 'Average deal size', value: '—', note: zh ? '汇总接口暂未提供' : 'Not provided by summary API', icon: RequestQuote, route: '/quotes' },
    { id: 'cycle', label: zh ? '平均成交周期' : 'Sales cycle', value: '—', note: zh ? '汇总接口暂未提供' : 'Not provided by summary API', icon: Purchase, route: '/opportunities' },
    { id: 'leads', label: zh ? '线索' : 'Leads', value: data ? String(leads) : '—', note: (zh ? '已合格 ' : 'Qualified ') + qualified, icon: UserFollow, route: '/leads' },
  ];
  const insights = [
    { title: (zh ? '开放销售机会：' : 'Open opportunities: ') + openOpps, detail: zh ? '检查阶段、预计成交日期与下一步行动。' : 'Review stage, expected close date, and next steps.', route: '/opportunities', action: zh ? '查看商机' : 'Review deals', tone: 'info' },
    { title: (zh ? '未结余额：' : 'Outstanding balance: ') + formatAmount(outstanding, 'CNY', lang), detail: zh ? '核对关联订单与收款记录，确认是否需要跟进。' : 'Review related orders and payment records.', route: '/payments', action: zh ? '查看收款' : 'Review payments', tone: outstanding > 0 ? 'warning' : 'success' },
    { title: (zh ? '线索：' : 'Leads: ') + leads + (zh ? '，已合格 ' : ', qualified ') + qualified, detail: zh ? '持续跟进未合格线索并补全来源信息。' : 'Follow up unqualified leads and complete source details.', route: '/leads', action: zh ? '跟进线索' : 'Follow up', tone: 'info' },
  ];
  const addTask = () => { const title = taskText.trim(); if (!title) return; setTasks((current) => [{ id: Date.now(), title, done: false }, ...current]); setTaskText(''); };
  return <div className="sales-dashboard" data-testid="page-dashboard">
    <div className="page-heading sales-page-heading">
      <div><div className="eyebrow">COSMOS CORTEX · {zh ? '销售运营' : 'SALES OPERATIONS'}</div><h1>{zh ? '销售大屏' : 'Sales overview'}</h1><p>{zh ? '5 秒看清业绩、管道、风险与下一步行动。' : 'Performance, pipeline, risk, and next actions at a glance.'}</p><div className="dashboard-updated">{zh ? '数据来源：CRM 当前汇总' : 'Source: current CRM summary'}</div></div>
      <div className="page-actions sales-page-actions"><Button kind="tertiary" size="sm" renderIcon={SearchIcon} onClick={() => setLocation('/opportunities')}>{zh ? '查看商机' : 'View opportunities'}</Button><Button kind="primary" size="sm" renderIcon={Add} onClick={() => setLocation('/leads')}>{zh ? '新增线索' : 'Add lead'}</Button><Button kind="ghost" size="sm" hasIconOnly renderIcon={Purchase} iconDescription={zh ? '刷新数据' : 'Refresh data'} onClick={() => refetch()} disabled={isFetching} /></div>
    </div>
    <section className="sales-filterbar" aria-label={zh ? '图表范围' : 'Chart range'}>
      <div className="filterbar-group"><span className="filterbar-label">{zh ? '趋势范围' : 'Trend range'}</span><div className="filter-segments">
        {[['six', zh ? '近 6 期' : '6 periods'], ['three', zh ? '近 3 期' : '3 periods'], ['twelve', zh ? '近 12 期' : '12 periods']].map(([id, label]) => <button key={id} type="button" className={'filter-segment ' + (range === id ? 'active' : '')} onClick={() => setRange(id)} aria-pressed={range === id}>{label}</button>)}
      </div></div><div className="filterbar-note"><span className="filter-dot" />{zh ? '金额按 CRM 当前汇总币种展示；目标与汇率尚未配置。' : 'Amounts use the current CRM summary currency; targets and FX are not configured.'}</div>
    </section>
    {isLoading ? <div className="dashboard-grid">{Array.from({ length: 8 }, (_, i) => <div className="kpi-card" key={i}><SkeletonText width="50%" /><SkeletonText heading width="65%" /></div>)}</div> : isError ? <div className="sales-error"><InlineNotification kind="error" title={zh ? '销售大屏暂时无法加载' : 'Sales dashboard unavailable'} subtitle={zh ? '请检查连接后重试。' : 'Check the connection and retry.'} /><Button kind="ghost" size="sm" onClick={() => refetch()}>{zh ? '重试' : 'Retry'}</Button></div> : <>
      <section className="insight-strip" aria-labelledby="insight-heading"><div className="insight-strip-head"><div><span className="insight-spark">✦</span><div><h2 id="insight-heading">{zh ? '经营提示' : 'Business signals'}</h2><p>{zh ? '根据 CRM 汇总数据生成的行动提示，不冒充预测性 AI 结论。' : 'Action cues from CRM data, not predictive AI claims.'}</p></div></div><button type="button" className="text-action" onClick={() => setShowAllInsights((value) => !value)}>{showAllInsights ? (zh ? '收起' : 'Show less') : (zh ? '查看全部 3 条' : 'View all 3')}</button></div>
        <div className="insight-items">{insights.slice(0, showAllInsights ? 3 : 1).map((item) => <div className={'insight-item ' + item.tone} key={item.title}><span className="insight-status" aria-hidden="true" /><div className="insight-copy"><strong>{item.title}</strong><span>{item.detail}</span></div><Button kind="ghost" size="sm" onClick={() => setLocation(item.route)}>{item.action}</Button></div>)}</div>
      </section>
      <section className="dashboard-grid sales-kpi-grid" aria-label={zh ? '核心销售指标' : 'Core sales KPIs'}>
        {kpis.map((item) => { const MetricIcon = item.icon; return <button type="button" key={item.id} className={'kpi-card sales-kpi-card ' + (selectedMetric === item.id ? 'selected' : '')} onClick={() => { setSelectedMetric(item.id); setLocation(item.route); }} aria-label={item.label + ': ' + item.value} data-testid={'kpi-card-' + item.id}><div className="kpi-topline"><span className="kpi-label">{item.label}</span><span className="kpi-icon"><MetricIcon size={20} aria-hidden="true" /></span></div><div className="kpi-value" data-testid={'kpi-value-' + item.id}>{item.value}</div><div className="kpi-note">{item.note}</div><span className="kpi-drill">{zh ? '查看明细' : 'View details'} <ChevronRight size={14} /></span></button>; })}
      </section>
      <section className="sales-primary-grid">
        <article className="section-panel quota-panel"><div className="section-head"><div><h2>{zh ? '目标达成' : 'Quota attainment'}</h2><p>{zh ? '完成了多少？与目标还差多少？' : 'How much is complete, and what remains?'}</p></div><Tag type="warm-gray">{zh ? '待配置' : 'Not configured'}</Tag></div>
          <div className="quota-empty"><div className="quota-ring" aria-hidden="true"><span>—</span><small>{zh ? '目标达成率' : 'Attainment'}</small></div><div className="quota-copy"><strong>{zh ? '尚未设置销售目标' : 'No sales target yet'}</strong><p>{zh ? '配置月、季、年目标后，才能准确显示达成率、时间进度与缺口。' : 'Set a monthly, quarterly, or annual target to calculate attainment and gap.'}</p><Button kind="tertiary" size="sm" onClick={() => setLocation('/opportunities')}>{zh ? '查看销售机会' : 'Review pipeline'}</Button></div></div>
          <div className="quota-metrics"><div><span>{zh ? '已成交' : 'Won revenue'}</span><strong>{data ? formatAmount(won, 'CNY', lang) : '—'}</strong></div><div><span>{zh ? '加权预测' : 'Weighted forecast'}</span><strong>{data ? formatAmount(weighted, 'CNY', lang) : '—'}</strong></div><div><span>{zh ? '未结余额' : 'Outstanding'}</span><strong>{data ? formatAmount(outstanding, 'CNY', lang) : '—'}</strong></div></div>
        </article>
        <article className="section-panel forecast-panel"><div className="section-head"><div><h2>{zh ? '销售预测与管道' : 'Sales forecast & pipeline'}</h2><p>{zh ? '商机当前分布在哪些阶段？' : 'Where are opportunities in the pipeline?'}</p></div><button className="text-action" type="button" onClick={() => setLocation('/opportunities')}>{zh ? '打开商机' : 'Open pipeline'} <ChevronRight size={14} /></button></div>
          <div className="forecast-summary"><div><span>{zh ? '管道总额' : 'Pipeline'}</span><strong>{data ? formatAmount(pipeline, 'CNY', lang) : '—'}</strong></div><div><span>{zh ? '加权金额' : 'Weighted'}</span><strong>{data ? formatAmount(weighted, 'CNY', lang) : '—'}</strong></div><div><span>{zh ? '开放商机' : 'Open deals'}</span><strong>{openOpps}</strong></div></div>
          {stages.length ? <div className="forecast-stage-list">{stages.map((stage, index) => { const total = stages.reduce((sum, row) => sum + Number(row.amount || 0), 0); const width = total > 0 ? Math.max(3, Number(stage.amount || 0) / total * 100) : 0; return <button type="button" className="forecast-stage-row" key={stage.stage + '-' + index} onClick={() => setLocation('/opportunities')}><span className="forecast-stage-name">{displayEnumValue(stage.stage, lang)}</span><span className="forecast-stage-track"><span style={{ width: width + '%' }} /></span><span className="forecast-stage-value">{formatAmount(stage.amount, 'CNY', lang)}</span><span className="forecast-stage-count">{stage.count}</span></button>; })}</div> : <EmptyState zh={zh} title={zh ? '暂无商机阶段数据' : 'No pipeline stage data'} detail={zh ? '新增销售机会后，这里会显示阶段金额分布。' : 'Stage distribution appears when opportunities are added.'} />}
          <div className="forecast-legend"><span><i className="legend-won" />{zh ? '已成交' : 'Won'}</span><span><i className="legend-weighted" />{zh ? '加权管道' : 'Weighted pipeline'}</span><span><i className="legend-pipeline" />{zh ? '未加权管道' : 'Pipeline'}</span></div>
        </article>
      </section>
      <section className="sales-secondary-grid">
        <article className="section-panel trend-panel"><div className="section-head"><div><h2>{zh ? '销售趋势' : 'Sales trend'}</h2><p>{zh ? '收入记录的周期变化' : 'Movement in recorded revenue'}</p></div><Tag type="gray">{range === 'three' ? (zh ? '近 3 期' : '3 periods') : range === 'twelve' ? (zh ? '近 12 期' : '12 periods') : (zh ? '近 6 期' : '6 periods')}</Tag></div>
          {visibleItems.length ? <div className="chart sales-trend-chart" role="img" aria-label={zh ? '月度收入柱状图' : 'Monthly revenue bar chart'} data-testid="chart-monthly-revenue">{visibleItems.map((item, index) => <div className="chart-col" key={item.month + '-' + index} title={item.month + ': ' + formatAmount(item.amount, 'CNY', lang)}><div className="trend-bar-value">{formatAmount(item.amount, 'CNY', lang)}</div><div className="bar-track"><div className="bar-fill" style={{ height: Math.max(2, item.amount / maxRevenue * 100) + '%' }} /></div><div className="bar-label">{item.month}</div></div>)}</div> : <EmptyState zh={zh} title={zh ? '暂无趋势数据' : 'No trend data'} detail={zh ? '产生收入记录后，趋势会显示在这里。' : 'Revenue records will appear here when available.'} />}
          <div className="chart-footnote">{zh ? '使用汇总接口返回的收入数据；对比期、毛利和订单数尚未接入。' : 'Uses revenue from the summary API; comparison, margin, and order-count series are not connected.'}</div>
        </article>
        <article className="section-panel funnel-panel"><div className="section-head"><div><h2>{zh ? '商机阶段漏斗' : 'Opportunity funnel'}</h2><p>{zh ? '商机集中在哪个阶段？' : 'Where are deals concentrated?'}</p></div><button type="button" className="text-action" onClick={() => setLocation('/opportunities')}>{zh ? '查看全部' : 'View all'} <ChevronRight size={14} /></button></div>
          {stages.length ? <div className="funnel-list">{stages.map((stage, index) => { const maxCount = Math.max(1, ...stages.map((row) => Number(row.count || 0))); return <button type="button" className="funnel-row" key={stage.stage + '-' + index} onClick={() => setLocation('/opportunities')}><span className="funnel-row-head"><span>{displayEnumValue(stage.stage, lang)}</span><strong>{stage.count} {zh ? '个' : 'deals'}</strong></span><span className="funnel-track"><span style={{ width: Math.max(4, Number(stage.count || 0) / maxCount * 100) + '%' }} /></span><span className="funnel-amount">{formatAmount(stage.amount, 'CNY', lang)}</span></button>; })}</div> : <EmptyState zh={zh} title={zh ? '暂无商机' : 'No opportunities'} detail={zh ? '创建商机后即可查看阶段分布。' : 'Create opportunities to see stage distribution.'} />}
        </article>
      </section>
      <section className="sales-action-grid">
        <article className="section-panel opportunity-focus"><div className="section-head"><div><h2>{zh ? '重点商机与风险检查' : 'Opportunity focus & risk review'}</h2><p>{zh ? '检查阶段、报价有效期和下一步行动。' : 'Review stages, quote expiry, and next actions.'}</p></div><Button kind="tertiary" size="sm" onClick={() => setLocation('/opportunities')}>{zh ? '管理商机' : 'Manage deals'}</Button></div>
          <div className="opportunity-focus-stats"><button type="button" onClick={() => setLocation('/opportunities')}><span>{zh ? '开放商机' : 'Open deals'}</span><strong>{data?.open_opportunity_count ?? '—'}</strong><small>{zh ? '查看阶段与金额' : 'Review stage and value'}</small></button><button type="button" onClick={() => setLocation('/quotes')}><span>{zh ? '报价记录' : 'Quotes'}</span><strong>{data?.quote_count ?? '—'}</strong><small>{zh ? '检查有效期与反馈' : 'Review expiry and response'}</small></button><button type="button" onClick={() => setLocation('/orders')}><span>{zh ? '开放订单' : 'Open orders'}</span><strong>{data?.open_order_count ?? '—'}</strong><small>{zh ? '待发货 ' : 'To ship '}{data?.orders_to_ship ?? '—'}</small></button></div>
          <div className="risk-note"><span className="risk-note-mark">!</span><div><strong>{zh ? '风险识别数据待补齐' : 'Risk signals need more data'}</strong><p>{zh ? '当前接口未提供最后活动时间、下一步行动和报价到期日，因此不伪造停滞商机清单。请从商机与报价模块核查。' : 'Last activity, next steps, and quote expiry are not in the current API, so stalled deals are not fabricated. Review opportunities and quotes directly.'}</p></div></div>
        </article>
        <article className="section-panel today-panel"><div className="section-head"><div><h2>{zh ? '今日待办' : 'Today’s tasks'}</h2><p>{zh ? '先把下一步行动记下来' : 'Capture your next action'}</p></div><Tag type={tasks.some((task) => !task.done) ? 'blue' : 'gray'}>{tasks.filter((task) => !task.done).length} {zh ? '待完成' : 'open'}</Tag></div>
          <form className="quick-task-form" onSubmit={(event) => { event.preventDefault(); addTask(); }}><TextInput id="quick-task-title" labelText={zh ? '快速添加待办' : 'Quick add task'} hideLabel value={taskText} onChange={(event) => setTaskText(event.currentTarget.value)} placeholder={zh ? '例如：跟进客户报价…' : 'e.g. Follow up on a quote…'} /><Button type="submit" size="md" renderIcon={Add} disabled={!taskText.trim()}>{zh ? '添加' : 'Add'}</Button></form>
          {tasks.length ? <div className="task-list">{tasks.map((task) => <label className={'task-item ' + (task.done ? 'done' : '')} key={task.id}><Checkbox id={'task-' + task.id} labelText="" checked={task.done} onChange={(_, state) => setTasks((current) => current.map((item) => item.id === task.id ? { ...item, done: state.checked } : item))} /><span>{task.title}</span><Tag type={task.done ? 'green' : 'warm-gray'}>{task.done ? (zh ? '已完成' : 'Done') : (zh ? '待办' : 'To do')}</Tag></label>)}</div> : <EmptyState zh={zh} title={zh ? '今天还没有待办' : 'No tasks yet'} detail={zh ? '添加一个行动项安排今天的销售工作。当前待办仅保存在页面状态中，尚未同步服务器。' : 'Add an action for today. Tasks are page-local and not synced to the server yet.'} />}
          <div className="today-links"><button type="button" onClick={() => setLocation('/leads')}>{zh ? '跟进线索' : 'Follow up leads'} <ChevronRight size={14} /></button><button type="button" onClick={() => setLocation('/quotes')}>{zh ? '跟进报价' : 'Follow up quotes'} <ChevronRight size={14} /></button></div>
        </article>
      </section>
      <section className="sales-operations-grid">
        <article className="section-panel"><div className="section-head"><div><h2>{zh ? '订单履约' : 'Order fulfillment'}</h2><p>{zh ? '订单、发货与交付状态' : 'Orders, shipping, and delivery'}</p></div><button type="button" className="text-action" onClick={() => setLocation('/deliveries')}>{zh ? '查看交付' : 'View deliveries'} <ChevronRight size={14} /></button></div><div className="operation-metric"><span className="operation-icon"><Purchase size={19} /></span><div><span>{zh ? '开放订单' : 'Open orders'}</span><strong>{data?.open_order_count ?? '—'}</strong></div><div className="operation-side"><span>{zh ? '待发货' : 'To ship'}</span><strong>{data?.orders_to_ship ?? '—'}</strong></div></div><div className="operation-link-row"><button onClick={() => setLocation('/orders')} type="button">{zh ? '订单管理' : 'Orders'} <ChevronRight size={14} /></button><button onClick={() => setLocation('/deliveries')} type="button">{zh ? '交付跟踪' : 'Deliveries'} <ChevronRight size={14} /></button></div></article>
        <article className="section-panel"><div className="section-head"><div><h2>{zh ? '应收与回款' : 'Receivables & payments'}</h2><p>{zh ? '未结余额与已登记回款' : 'Outstanding balance and payments'}</p></div><button type="button" className="text-action" onClick={() => setLocation('/payments')}>{zh ? '查看收款' : 'View payments'} <ChevronRight size={14} /></button></div><div className="receivables-value">{data ? formatAmount(outstanding, 'CNY', lang) : '—'}</div><div className="receivables-caption">{zh ? '当前汇总未结余额' : 'Current outstanding balance'}</div><div className="receivables-note">{zh ? '账龄与 DSO 暂未由接口提供。' : 'Aging buckets and DSO are not provided by the current API.'}</div></article>
        <article className="section-panel"><div className="section-head"><div><h2>{zh ? '报价跟踪' : 'Quote tracking'}</h2><p>{zh ? '报价是否已发送、接受或过期？' : 'Have quotes been sent, accepted, or expired?'}</p></div><button type="button" className="text-action" onClick={() => setLocation('/quotes')}>{zh ? '查看报价' : 'View quotes'} <ChevronRight size={14} /></button></div><div className="operation-metric"><span className="operation-icon"><RequestQuote size={19} /></span><div><span>{zh ? '报价记录' : 'Quote records'}</span><strong>{data?.quote_count ?? '—'}</strong></div><div className="operation-side"><span>{zh ? '转化率' : 'Conversion'}</span><strong>—</strong></div></div><div className="receivables-note">{zh ? '报价转化率需要报价—订单关联统计。' : 'Quote conversion requires quote-to-order aggregation.'}</div></article>
      </section>
      <section className="section-panel recent-records-panel"><div className="section-head"><div><h2>{zh ? '最近更新' : 'Recently updated'}</h2><p>{zh ? '哪些业务记录最近发生了变化？' : 'Which business records changed recently?'}</p></div><span>{zh ? '跨模块' : 'Across modules'}</span></div>
        {data?.recent_records.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>{zh ? '记录' : 'Record'}</th><th>{zh ? '模块' : 'Module'}</th><th>{zh ? '状态' : 'Status'}</th><th>{zh ? '更新时间' : 'Updated'}</th></tr></thead><tbody>{data.recent_records.map((record) => <tr key={record.entity + '-' + record.id} data-testid={'row-recent-' + record.id}><td><Link className="record-link" href={'/' + record.entity + '/' + record.id}>{titleFor(record)}</Link></td><td>{zh ? moduleFor(record.entity).label : moduleFor(record.entity).en}</td><td><StatusPill value={String(record.data.status ?? record.data.stage ?? '—')} lang={lang} /></td><td>{record.updated_at ? new Date(record.updated_at).toLocaleDateString(zh ? 'zh-CN' : 'en-US') : '—'}</td></tr>)}</tbody></table></div> : <EmptyState zh={zh} title={zh ? '暂无最近记录' : 'No recent records'} detail={zh ? '新建或更新业务记录后会显示在这里。' : 'New and updated records will appear here.'} />}
      </section>
      <footer className="dashboard-footnote"><span>{zh ? '数据口径：CRM 当前汇总接口' : 'Data definition: current CRM summary API'}</span><span>{zh ? '未配置目标、汇率、活动与账龄数据的指标会显示为 —。' : 'Unavailable target, FX, activity, and aging metrics are shown as —.'}</span><button type="button" onClick={() => refetch()}>{zh ? '刷新数据' : 'Refresh data'} <ChevronRight size={13} /></button></footer>
    </>}
  </div>;
}

function EmptyState({ zh, title, detail, action }: { zh: boolean; title: string; detail: string; action?: React.ReactNode }) {
  return <div className="empty-state" data-testid="state-empty"><div className="empty-mark"><SearchIcon size={21} /></div><h3>{title}</h3><p>{detail}</p>{action}</div>;
}

function StatusPill({ value, lang }: { value: string; lang: Lang }) {
  const lowered = value.toLowerCase();
  const tone = /won|paid|delivered|已收款|已送达|成交|已接受|已完成/.test(lowered) ? 'good' : /overdue|failed|lost|异常|失败|逾期|拒绝/.test(lowered) ? 'bad' : /pending|draft|新建|待|草稿|联系中/.test(lowered) ? 'warn' : '';
  const tagType = tone === 'good' ? 'green' : tone === 'bad' ? 'red' : tone === 'warn' ? 'warm-gray' : 'gray';
  return <Tag type={tagType} className={`status-tag ${tone}`} data-testid={`status-${value.replaceAll(' ', '-')}`}>{displayEnumValue(value, lang)}</Tag>;
}

function ResourcePage({ entity, lang }: { entity: CrmEntity; lang: Lang }) {
  const mod = moduleFor(entity);
  const params = useParams<{ id?: string }>();
  const id = params.id;
  const zh = lang === 'zh';
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('search') ?? '');
  const [status, setStatus] = useState('');
  const [view, setView] = useState<'table' | 'kanban' | 'cards'>('table');
  const [followUpDraft, setFollowUpDraft] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<'create' | 'edit' | 'delete' | null>(null);
  const [selected, setSelected] = useState<CrmRecord | null>(null);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const queryClient = useQueryClient();
  const listParams = useMemo(() => ({ entity, q: search || undefined, status: status || undefined, page, page_size: 20 }), [entity, search, status, page]);
  const list = useListCrmRecords(listParams);
  const leadAllCount = useListCrmRecords({ entity: 'leads', page: 1, page_size: 1 }, { query: { enabled: entity === 'leads' } });
  const leadNewCount = useListCrmRecords({ entity: 'leads', status: 'new', page: 1, page_size: 1 }, { query: { enabled: entity === 'leads' } });
  const leadContactedCount = useListCrmRecords({ entity: 'leads', status: 'contacted', page: 1, page_size: 1 }, { query: { enabled: entity === 'leads' } });
  const leadQualifiedCount = useListCrmRecords({ entity: 'leads', status: 'qualified', page: 1, page_size: 1 }, { query: { enabled: entity === 'leads' } });
  const leadConvertedCount = useListCrmRecords({ entity: 'leads', status: 'converted', page: 1, page_size: 1 }, { query: { enabled: entity === 'leads' } });
  const leadUnqualifiedCount = useListCrmRecords({ entity: 'leads', status: 'unqualified', page: 1, page_size: 1 }, { query: { enabled: entity === 'leads' } });
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
  const beginCreate = () => { setSelected(null); setFormValues(entity === 'leads' ? { status: 'new' } : {}); setModal('create'); };
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
  const leadSummary = [
    { id: '', title: zh ? '全部线索' : 'All leads', count: leadAllCount.data?.total ?? 0 },
    { id: 'new', title: zh ? '新线索' : 'New', count: leadNewCount.data?.total ?? 0 },
    { id: 'contacted', title: zh ? '跟进中' : 'Contacting', count: leadContactedCount.data?.total ?? 0 },
    { id: 'qualified', title: zh ? '已合格' : 'Qualified', count: leadQualifiedCount.data?.total ?? 0 },
    { id: 'converted', title: zh ? '已转化' : 'Converted', count: leadConvertedCount.data?.total ?? 0 },
    { id: 'unqualified', title: zh ? '不合格' : 'Unqualified', count: leadUnqualifiedCount.data?.total ?? 0 },
  ];
  const valueFor = (rec: CrmRecord, key: string) => {
    const value = rec.data[key];
    if (value === true) return zh ? '是' : 'Yes';
    if (value === false) return zh ? '否' : 'No';
    if (value === null || value === undefined || value === '') return '—';
    if (['amount', 'total', 'subtotal', 'tax', 'estimated_amount'].includes(key)) return formatAmount(value, String(rec.data.currency ?? 'CNY'), lang);
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
      <div className="page-heading"><div><div className="eyebrow">{zh ? '客户关系管理' : 'CUSTOMER RELATIONSHIP MANAGEMENT'}</div><h1>{heading}{entity === 'leads' && list.data ? <Tag type="gray" className="lead-total-tag">{list.data.total}</Tag> : null}</h1><p>{entity === 'leads' ? (zh ? '从首次接触到合格转化，集中管理每条潜在业务机会。' : 'Manage every prospect from first contact to qualification.') : (zh ? '检索并维护完整的客户业务记录。' : 'Find and maintain your customer business records.')}</p></div><div className="page-actions"><Button kind="primary" size="md" renderIcon={Add} onClick={beginCreate} data-testid={`button-create-${entity}`}>{entity === 'leads' ? (zh ? '新建线索' : 'New lead') : (zh ? '新建记录' : 'Create record')}</Button></div></div>
      {entity === 'leads' && <section className="lead-summary-grid" aria-label={zh ? '线索摘要' : 'Lead summary'}>{leadSummary.map((item) => <button key={item.id || 'all'} type="button" className={'lead-summary-tile ' + (status === item.id ? 'active' : '')} onClick={() => { setStatus(item.id); setPage(1); }} aria-pressed={status === item.id}><span>{item.title}</span><strong>{item.count}</strong><small>{zh ? '条线索' : 'leads'}</small></button>)}</section>}
      <section className="panel">
        <div className="toolbar lead-toolbar"><Search size="md" placeholder={zh ? (entity === 'leads' ? '搜索公司、联系人、邮箱、电话…' : `搜索${heading}...`) : `Search ${mod.en.toLowerCase()}...`} labelText={zh ? '搜索记录' : 'Search records'} value={search} onChange={(event) => { setSearch(event.currentTarget.value); setPage(1); }} data-testid={`input-search-${entity}`} />
          {mod.statuses ? <Dropdown id={`filter-status-${entity}`} titleText={zh ? '状态筛选' : 'Filter status'} label={status ? (mod.statuses.find((option) => option.value === status) ? (zh ? mod.statuses.find((option) => option.value === status)!.zh : mod.statuses.find((option) => option.value === status)!.en) : status) : (zh ? '所有状态' : 'All statuses')} items={[{ id: '', label: zh ? '所有状态' : 'All statuses' }, ...mod.statuses.map((option) => ({ id: option.value, label: zh ? option.zh : option.en }))]} itemToString={(item) => item?.label ?? ''} selectedItem={status ? (mod.statuses.find((option) => option.value === status) ? { id: status, label: zh ? mod.statuses.find((option) => option.value === status)!.zh : mod.statuses.find((option) => option.value === status)!.en } : null) : { id: '', label: zh ? '所有状态' : 'All statuses' }} onChange={({ selectedItem }) => { setStatus(selectedItem?.id ?? ''); setPage(1); }} data-testid={`dropdown-filter-status-${entity}`} /> : <TextInput id={`filter-status-${entity}`} labelText={zh ? '状态筛选' : 'Filter status'} placeholder={zh ? '输入状态' : 'Enter status'} value={status} onChange={(event) => { setStatus(event.currentTarget.value); setPage(1); }} data-testid={`input-filter-status-${entity}`} />}
          <span className="toolbar-count" data-testid={`text-record-count-${entity}`}>{list.data ? `${list.data.total} ${zh ? '条记录' : 'records'}` : ''}</span>
          {entity === 'leads' && <div className="lead-view-switch" role="group" aria-label={zh ? '线索视图' : 'Lead view'}>{([['table', zh ? '表格' : 'Table'], ['kanban', zh ? '看板' : 'Kanban'], ['cards', zh ? '卡片' : 'Cards']] as const).map(([id, text]) => <button type="button" key={id} className={view === id ? 'active' : ''} aria-pressed={view === id} onClick={() => setView(id)}>{text}</button>)}</div>}
        </div>
        {list.isLoading ? <div style={{ padding: 14 }} data-testid="state-loading">{Array.from({ length: 8 }, (_, i) => <div className="skeleton-row" key={i} />)}</div> :
          list.isError ? <div className="error-state" data-testid="state-error"><InlineNotification kind="error" title={zh ? '记录加载失败' : 'Could not load records'} subtitle={`${zh ? '原始错误：' : 'Raw error: '}${list.error instanceof Error ? list.error.message : String(list.error ?? 'Unknown error')}`} /><Button kind="ghost" size="sm" onClick={() => list.refetch()} data-testid="button-retry-list">{zh ? '重试' : 'Retry'}</Button></div> :
          !list.data?.items.length ? <EmptyState zh={zh} title={zh ? '还没有记录' : 'No records yet'} detail={search || status ? (zh ? '请调整搜索条件或筛选状态。' : 'Try changing your search or status filter.') : (zh ? `创建第一条${heading}记录，开始追踪业务进展。` : `Create your first ${mod.en.toLowerCase()} record to get started.`)} action={!search && !status ? <Button kind="tertiary" size="sm" renderIcon={Add} onClick={beginCreate} data-testid={`button-empty-create-${entity}`}>{zh ? '创建记录' : 'Create record'}</Button> : undefined} /> :
          <>
            {entity === 'leads' && view === 'kanban' ? <div className="lead-kanban" data-testid="lead-kanban-view">{leadStatuses.map((stage) => { const stageItems = list.data!.items.filter((item) => String(item.data.status ?? 'new') === stage.value); return <section className="lead-kanban-column" key={stage.value}><header><strong>{zh ? stage.zh : stage.en}</strong><Tag type="gray">{stageItems.length}</Tag></header>{stageItems.length ? stageItems.map((item) => <Link className="lead-kanban-card" key={item.id} href={`/leads/${item.id}`}><strong>{String(item.data.company ?? item.data.name ?? '—')}</strong><span>{String(item.data.name ?? '—')}</span><small>{String(item.data.country ?? '—')}</small><div><StatusPill value={String(item.data.status ?? 'new')} lang={lang} />{item.data.rating ? <Tag type={item.data.rating === 'hot' ? 'red' : item.data.rating === 'warm' ? 'warm-gray' : 'blue'}>{displayEnumValue(String(item.data.rating), lang)}</Tag> : null}</div>{item.data.next_action ? <small>{zh ? '下次行动：' : 'Next: '}{String(item.data.next_action).slice(0,10)}</small> : null}</Link>) : <div className="lead-kanban-empty">{zh ? '暂无线索' : 'No leads'}</div>}</section>; })}</div> : null}
            {entity === 'leads' && view === 'cards' ? <div className="lead-card-grid" data-testid="lead-card-view">{list.data.items.map((item) => <Link className="lead-object-card" key={item.id} href={`/leads/${item.id}`}><div className="lead-object-card-top"><span className="lead-avatar">{String(item.data.company ?? item.data.name ?? 'L').slice(0,1).toUpperCase()}</span><StatusPill value={String(item.data.status ?? 'new')} lang={lang} /></div><h3>{String(item.data.company ?? '—')}</h3><p>{String(item.data.name ?? '—')}{item.data.title ? ` · ${String(item.data.title)}` : ''}</p><div className="lead-object-card-details"><span>{String(item.data.country ?? '—')}</span><span>{String(item.data.source ? displayEnumValue(String(item.data.source), lang) : '—')}</span></div><div className="lead-object-card-footer"><span>{zh ? '评分' : 'Rating'}: {item.data.rating ? displayEnumValue(String(item.data.rating), lang) : '—'}</span><ChevronRight size={16} /></div></Link>)}</div> : null}
            <div className={`table-wrap desktop-record-table ${entity === 'leads' && view !== 'table' ? 'lead-view-hidden' : ''}`}>
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
            <div className={`mobile-card-list ${entity === 'leads' && view === 'kanban' ? 'lead-view-hidden' : ''}`} role="list" aria-label={zh ? `${heading}卡片列表` : `${mod.en} card list`} data-testid={`mobile-card-list-${entity}`}>
              {list.data.items.map((item) => {
                const titleKey = entity === 'leads' ? 'company' : mod.columns[0];
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
      <div className="page-heading"><div><Link href={`/${entity}`} className="record-link" data-testid="link-back"><ArrowLeft size={14} /> {zh ? `返回${heading}` : `Back to ${heading}`}</Link><div className="eyebrow" style={{ marginTop: 12 }}>{entity === 'leads' ? (zh ? '线索记录' : 'LEAD RECORD') : (zh ? '记录详情' : 'RECORD DETAIL')} · {record.id}</div><h1>{entity === 'leads' ? String(record.data.company ?? titleFor(record)) : titleFor(record)}</h1><p>{entity === 'leads' ? `${titleFor(record)}${record.data.title ? ` · ${String(record.data.title)}` : ''} · ` : ''}{zh ? `创建于 ${new Date(record.created_at).toLocaleString('zh-CN')}` : `Created ${new Date(record.created_at).toLocaleString('en-US')}`}</p></div><div className="page-actions"><Button kind="tertiary" renderIcon={Edit} onClick={() => beginEdit(record)} data-testid="button-detail-edit">{zh ? '编辑线索' : 'Edit lead'}</Button>{entity === 'leads' && String(record.data.status ?? 'new') !== 'qualified' && String(record.data.status ?? 'new') !== 'converted' ? <Button kind="primary" onClick={() => updateMutation.mutate({ entity, id: record.id, data: { data: { ...record.data, status: 'qualified' } } }, { onSuccess: () => invalidate(record.id) })}>{zh ? '标记为已合格' : 'Mark qualified'}</Button> : null}<Button kind="danger--tertiary" renderIcon={TrashCan} onClick={() => { setSelected(record); setModal('delete'); }} data-testid="button-detail-delete">{zh ? '删除' : 'Delete'}</Button></div></div>
      {entity === 'leads' && <section className="lead-path-panel"><div className="lead-path-heading"><div><h2>{zh ? '线索阶段' : 'Lead path'}</h2><p>{zh ? '推进阶段时同步更新线索状态。' : 'Move the lead forward as qualification progresses.'}</p></div><StatusPill value={String(record.data.status ?? 'new')} lang={lang} /></div><div className="lead-path-steps">{leadStatuses.filter((item) => item.value !== 'unqualified').map((stage, index, stages) => { const current = stages.findIndex((item) => item.value === String(record.data.status ?? 'new')); const active = current < 0 ? index === 0 : index <= current; return <button key={stage.value} type="button" className={'lead-path-step ' + (active ? 'complete' : '') + (stage.value === record.data.status ? ' current' : '')} onClick={() => updateMutation.mutate({ entity, id: record.id, data: { data: { ...record.data, status: stage.value } } }, { onSuccess: () => invalidate(record.id) })}><span>{active ? '✓' : index + 1}</span><strong>{zh ? stage.zh : stage.en}</strong></button>; })}</div><div className="lead-guidance">{zh ? '推进建议：确认联系人角色、采购需求、预计采购时间，并安排明确的下一步行动。' : 'Guidance: confirm the contact role, buying need, timing, and a concrete next action.'}</div></section>}
      <div className="detail-layout"><section className="detail-card"><div className="detail-card-header"><h2>{entity === 'leads' ? (zh ? '线索详情' : 'Lead details') : (zh ? '业务信息' : 'Business information')}</h2>{record.data.status || record.data.stage ? <StatusPill value={String(record.data.status ?? record.data.stage)} lang={lang} /> : null}</div><div className="detail-grid">{mod.fields.map((field) => <div className="detail-field" key={field.key} data-testid={`detail-field-${field.key}`}><div className="detail-label">{displayLabel(field.key, lang)}</div><div className="detail-value">{valueFor(record, field.key)}</div></div>)}</div></section>
        <aside className="metadata"><strong>{entity === 'leads' ? (zh ? '下一步行动' : 'Next action') : (zh ? '记录信息' : 'Record information')}</strong>{entity === 'leads' ? <><div className="lead-next-action-date">{record.data.next_action ? String(record.data.next_action).slice(0,10) : (zh ? '尚未安排日期' : 'No date scheduled')}</div><p>{zh ? '保持每条线索都有明确的下一步。' : 'Keep a concrete next step for every lead.'}</p><Button kind="tertiary" size="sm" renderIcon={Edit} onClick={() => beginEdit(record)}>{zh ? '安排下一步' : 'Schedule next step'}</Button><div className="lead-score-card"><strong>{zh ? '线索评分' : 'Lead rating'}</strong><div>{record.data.rating ? <Tag type={record.data.rating === 'hot' ? 'red' : record.data.rating === 'warm' ? 'warm-gray' : 'blue'}>{displayEnumValue(String(record.data.rating), lang)}</Tag> : <span>—</span>}</div></div></> : null}<div>{zh ? '记录 ID' : 'Record ID'}: {record.id}</div><div style={{ marginTop: 10 }}>{zh ? '创建时间' : 'Created'}: {new Date(record.created_at).toLocaleString(zh ? 'zh-CN' : 'en-US')}</div><div style={{ marginTop: 10 }}>{zh ? '最近更新' : 'Last updated'}: {new Date(record.updated_at).toLocaleString(zh ? 'zh-CN' : 'en-US')}</div></aside>
      </div>{entity === 'leads' && <section className="lead-activity-panel"><div className="section-head"><div><h2>{zh ? '活动与跟进' : 'Activity timeline'}</h2><p>{zh ? '记录沟通结果，让后续跟进有迹可循。' : 'Capture interactions so follow-up has context.'}</p></div></div>{record.data.notes ? <div className="lead-activity-entry"><span className="lead-activity-dot" /><div><strong>{zh ? '线索备注 / 最近记录' : 'Lead notes / latest record'}</strong><p>{String(record.data.notes)}</p><small>{record.data.last_follow_up ? String(record.data.last_follow_up).slice(0,10) : new Date(record.updated_at).toLocaleDateString(zh ? 'zh-CN' : 'en-US')}</small></div></div> : <div className="lead-activity-empty">{zh ? '还没有跟进记录。你可以从编辑线索中补充沟通结果。' : 'No activity recorded yet. Add a note when editing this lead.'}</div>}<Button kind="tertiary" size="sm" renderIcon={Edit} onClick={() => beginEdit(record)}>{zh ? '写跟进 / 更新备注' : 'Log follow-up / update notes'}</Button></section>}</>}</>}
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
    <Route path="/accounts/:id"><AccountsWorkspace lang={lang} /></Route>
    <Route path="/accounts"><AccountsWorkspace lang={lang} /></Route>
    <Route path="/contacts/:id"><ContactsWorkspace lang={lang} /></Route>
    <Route path="/contacts"><ContactsWorkspace lang={lang} /></Route>
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
