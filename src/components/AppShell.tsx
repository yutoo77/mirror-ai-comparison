import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Activity,
  Archive,
  BookOpenCheck,
  ChevronDown,
  CircleDot,
  FlaskConical,
  Columns3,
  Columns2,
  CircleHelp,
  Menu,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useWorkspace } from '../app/workspaceContext';
import { formatDate } from '../domain/metrics';
import { MeasurementDialog } from './MeasurementDialog';
import { ManualObservationDialog } from './ManualObservationDialog';
import { OnboardingDialog } from './OnboardingDialog';
import { EvidencePackDialog } from './EvidencePackDialog';
import { useStorageError } from '../app/storageStatus';
import { WorkspaceBackupDialog } from './WorkspaceBackupDialog';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

const mobileQuery = '(max-width: 900px)';
function subscribeToViewport(onChange: () => void) {
  const query = window.matchMedia?.(mobileQuery);
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}
function getMobileViewport() {
  return window.matchMedia?.(mobileQuery).matches ?? false;
}

const navigation = [
  { to: '/', label: '比較ラボ', shortLabel: '比較', icon: Columns3, end: true },
  {
    to: '/observe',
    label: '観測',
    shortLabel: '観測',
    icon: Activity,
    end: false,
  },
  {
    to: '/findings',
    label: 'Findings',
    shortLabel: '発見',
    icon: CircleDot,
    end: false,
  },
  {
    to: '/actions',
    label: '改善',
    shortLabel: '改善',
    icon: FlaskConical,
    end: false,
  },
  {
    to: '/sources',
    label: '公式情報',
    shortLabel: '情報',
    icon: BookOpenCheck,
    end: false,
  },
] as const;

const pageNames: Record<string, string> = {
  '/': '比較ラボ',
  '/overview': '全体の指標',
  '/observe': '観測',
  '/findings': 'Findings',
  '/actions': '改善',
  '/sources': '公式情報',
  '/help': '使い方',
};

export function AppShell() {
  const storageError = useStorageError();
  const location = useLocation();
  const { active, workspaces, selectWorkspace, resetDemo } = useWorkspace();
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [manualObservationOpen, setManualObservationOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [packOpen, setPackOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const isMobile = useSyncExternalStore(
    subscribeToViewport,
    getMobileViewport,
    () => false,
  );
  const menuIsModal = isMobile && mobileMenuOpen;
  const sidebarRef = useModalAccessibility<HTMLElement>(menuIsModal, () =>
    setMobileMenuOpen(false),
  );
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeMenuForDialog = () => {
    // The sidebar trigger becomes hidden on mobile. Return dialog focus to the menu button instead.
    if (mobileMenuOpen) menuButtonRef.current?.focus();
    setMobileMenuOpen(false);
  };
  const basePath = `/${location.pathname.split('/').filter(Boolean)[0] ?? ''}`;
  const pageName = pageNames[basePath] ?? 'Mirror';

  useLayoutEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        本文へ移動
      </a>
      <aside
        ref={sidebarRef}
        id="workspace-navigation"
        className={`sidebar ${mobileMenuOpen ? 'is-open' : ''}`}
        role={menuIsModal ? 'dialog' : undefined}
        aria-modal={menuIsModal ? true : undefined}
        aria-label={menuIsModal ? 'メニュー' : undefined}
        inert={isMobile && !mobileMenuOpen}
      >
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <Columns2 size={20} strokeWidth={1.8} />
          </span>
          <div>
            <strong>Mirror</strong>
            <small>AI認識の比較ラボ</small>
          </div>
          <button
            className="icon-button mobile-menu-close"
            type="button"
            aria-label="メニューを閉じる"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="workspace-picker">
          <label htmlFor="workspace-select">Workspace</label>
          <div className="workspace-picker__control">
            <span className="workspace-avatar" aria-hidden="true">
              {active.workspace.subject.displayName.slice(0, 1).toUpperCase()}
            </span>
            <select
              id="workspace-select"
              value={active.workspace.id}
              onChange={(event) => selectWorkspace(event.target.value)}
            >
              {workspaces.map((snapshot) => (
                <option
                  key={snapshot.workspace.id}
                  value={snapshot.workspace.id}
                >
                  {snapshot.workspace.restoreHistory?.length
                    ? snapshot.workspace.name
                    : snapshot.workspace.subject.displayName}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" size={16} />
          </div>
          <button
            className="workspace-picker__add"
            type="button"
            onClick={() => {
              closeMenuForDialog();
              setOnboardingOpen(true);
            }}
          >
            <Plus aria-hidden="true" size={15} />
            対象を追加
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="メインナビゲーション">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) => (isActive ? 'is-active' : '')}
            >
              <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
              <span>{label}</span>
              {label === 'Findings' &&
              active.findings.filter((item) => item.status === 'open').length >
                0 ? (
                <span
                  className="nav-count"
                  aria-label={`${active.findings.filter((item) => item.status === 'open').length}件`}
                >
                  {
                    active.findings.filter((item) => item.status === 'open')
                      .length
                  }
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__spacer" />
        <div className="data-boundary">
          <span>
            <CircleDot aria-hidden="true" size={14} />{' '}
            {active.workspace.isDemo ? '架空のデモデータ' : 'ローカルWorkspace'}
          </span>
          <p>このブラウザに保存 · 自動同期なし</p>
        </div>
        <div className="sidebar-footer">
          <NavLink
            to="/help"
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) => (isActive ? 'is-active' : '')}
          >
            <CircleHelp size={16} aria-hidden="true" />
            使い方と判定について
          </NavLink>
          <button
            type="button"
            onClick={() => {
              closeMenuForDialog();
              setBackupOpen(true);
            }}
          >
            <Archive size={16} aria-hidden="true" />
            バックアップと復元
          </button>
          <button
            type="button"
            onClick={() => {
              closeMenuForDialog();
              setPackOpen(true);
            }}
          >
            <ShieldCheck aria-hidden="true" size={16} />
            監査パックを検証
          </button>
          <button type="button" onClick={resetDemo}>
            <RotateCcw aria-hidden="true" size={16} />
            デモデータを復元
          </button>
        </div>
      </aside>

      {mobileMenuOpen ? (
        <button
          className="mobile-scrim"
          type="button"
          aria-label="メニューの外側を閉じる"
          tabIndex={-1}
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}

      <div className="app-main" inert={menuIsModal}>
        <header className="topbar">
          <div className="topbar__left">
            <button
              className="icon-button mobile-menu-button"
              ref={menuButtonRef}
              type="button"
              aria-label="メニューを開く"
              aria-expanded={menuIsModal}
              aria-controls="workspace-navigation"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu aria-hidden="true" size={20} />
            </button>
            <div>
              <span className="topbar__page">{pageName}</span>
              <span className="topbar__context">
                {active.workspace.subject.displayName} · 最終観測{' '}
                {formatDate(active.workspace.lastMeasuredAt)}
              </span>
            </div>
          </div>
          <div className="topbar__actions">
            {active.workspace.isDemo ? (
              <span className="demo-label">DEMO</span>
            ) : null}
            <button
              className="button button--primary button--compact"
              type="button"
              onClick={() => setRunOpen(true)}
              disabled={
                active.probes.filter((probe) => probe.status === 'active')
                  .length === 0
              }
            >
              <Play aria-hidden="true" size={16} />
              観測を開始
            </button>
          </div>
        </header>

        <main id="main-content" className="page-container" tabIndex={-1}>
          {storageError ? (
            <div className="storage-warning" role="alert">
              <p>{storageError}</p>
              <button
                className="button button--secondary button--compact"
                type="button"
                onClick={() => setBackupOpen(true)}
              >
                データを退避する
              </button>
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>

      <nav
        className="bottom-nav"
        aria-label="モバイルナビゲーション"
        inert={menuIsModal}
      >
        {navigation.map(({ to, shortLabel, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => (isActive ? 'is-active' : '')}
          >
            <Icon aria-hidden="true" size={19} />
            <span>{shortLabel}</span>
          </NavLink>
        ))}
      </nav>

      <OnboardingDialog
        open={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
      />
      <MeasurementDialog
        open={runOpen}
        onClose={() => setRunOpen(false)}
        onManual={() => {
          setRunOpen(false);
          setManualObservationOpen(true);
        }}
      />
      <ManualObservationDialog
        key={active.workspace.id}
        open={manualObservationOpen}
        onClose={() => setManualObservationOpen(false)}
      />
      {packOpen ? (
        <EvidencePackDialog onClose={() => setPackOpen(false)} />
      ) : null}
      {backupOpen ? (
        <WorkspaceBackupDialog onClose={() => setBackupOpen(false)} />
      ) : null}
    </div>
  );
}
