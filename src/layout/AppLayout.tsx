import { useState } from "react";
import { Layout, Grid, Drawer, Button, Space, Switch, Tooltip, Typography } from "antd";
import { MenuOutlined, SunOutlined, MoonOutlined, LeftOutlined, RightOutlined, SwapOutlined } from "@ant-design/icons";
import { Outlet, useLocation } from "react-router-dom";
import { OpsetteHeader } from "@/components/opsette-header";
import { useThemeMode } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import AboutModal from "@/components/AboutModal";
import PrivacyModal from "@/components/PrivacyModal";
import StandaloneNotice from "@/components/StandaloneNotice";
import { ChooserModal } from "@/components/smartflow/ChooserModal";
import { useCreateFlow } from "@/lib/useCreateFlow";
import { FlowsProvider } from "./FlowsContext";
import { DiscoveryProvider } from "./DiscoveryContext";
import { FlowSidebar } from "./FlowSidebar";

const { Sider, Content, Footer } = Layout;
const { Link, Text } = Typography;
const { useBreakpoint } = Grid;

const SIDEBAR_COLLAPSED_KEY = "smart-flow-sidebar-collapsed";

/** Outer shell — just wires up FlowsProvider so both the sidebar and the
 *  header's "Change diagram" chooser (AppLayoutInner) can read/create flows. */
export default function AppLayout() {
  return (
    <FlowsProvider>
      <DiscoveryProvider>
        <AppLayoutInner />
      </DiscoveryProvider>
    </FlowsProvider>
  );
}

/**
 * The persistent app chrome: header (including "Change diagram" — the one
 * pre-existing header action, restored here rather than dropped), a
 * flow-list sidebar (Content Flow's Sider/Menu mechanics — sticky under the
 * header, collapsible, a Drawer standing in on mobile), and the routed page
 * via <Outlet/>. Every route except NotFound renders inside this.
 *
 * The collapse trigger is a custom node, not AntD's default — the stock
 * trigger paints a translucent overlay strip that reads as a mismatched,
 * washed-out band against SmartFlow's flat `#000`/`#fff` surfaces. This one
 * is a plain solid-color row instead.
 *
 * Colors are set explicitly rather than via AntD's `theme="dark"` prop on
 * Sider/Menu — that prop pulls in AntD's own dark surface color, which reads
 * as a visible, slightly-off panel against SmartFlow's actual `#000` dark
 * background. The global ConfigProvider algorithm (theme.tsx) already
 * recolors every AntD control correctly; this only sets the container
 * backgrounds, in flat solid colors, no translucency layered on top.
 */
function AppLayoutInner() {
  const { mode, toggle } = useThemeMode();
  const isDark = mode === "dark";
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const location = useLocation();
  const onFlowPage = location.pathname.startsWith("/flow/");
  const { createFromType, createFromTemplate } = useCreateFlow();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);

  const handleCollapse = (v: boolean) => {
    setCollapsed(v);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, v ? "1" : "0");
    } catch {
      /* non-fatal */
    }
  };

  const headerExtras = (
    <>
      {isMobile && (
        <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} aria-label="Open flows menu" />
      )}
      <SunOutlined style={{ opacity: isDark ? 0.4 : 1, fontSize: 13, color: isDark ? "#94A3B8" : "#64748B" }} />
      <Switch
        checked={isDark}
        onChange={() => {
          haptic("tap");
          toggle();
        }}
        size="small"
      />
      <MoonOutlined style={{ opacity: isDark ? 1 : 0.4, fontSize: 13, color: isDark ? "#E4C49A" : "#94A3B8" }} />
      {onFlowPage && (
        <Tooltip title="Change diagram">
          <Button size="small" icon={<SwapOutlined />} onClick={() => setChooserOpen(true)} aria-label="Change diagram" />
        </Tooltip>
      )}
    </>
  );

  const sidebarBg = isDark ? "#000" : "#ffffff";
  const sidebarBorder = isDark ? "#1f1f1f" : "#e5e7eb";

  return (
    <>
      <Layout style={{ minHeight: "100vh", background: isDark ? "#000" : "#f5f6f8" }}>
        <OpsetteHeader theme={isDark ? "dark" : "light"} rightExtra={headerExtras} />

        <Layout style={{ background: "transparent" }}>
          {!isMobile && (
            <Sider
              width={230}
              collapsible
              collapsed={collapsed}
              onCollapse={handleCollapse}
              trigger={
                <div
                  style={{
                    background: sidebarBg,
                    color: isDark ? "#94A3B8" : "#64748B",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                  }}
                >
                  {collapsed ? <RightOutlined /> : <LeftOutlined />}
                </div>
              }
              style={{
                background: sidebarBg,
                borderRight: `1px solid ${sidebarBorder}`,
                position: "sticky",
                top: 60,
                height: "calc(100vh - 60px)",
                overflow: "auto",
              }}
            >
              <FlowSidebar collapsed={collapsed} onNavigate={() => {}} />
            </Sider>
          )}

          <Content style={{ background: isDark ? "#000" : "#f5f6f8" }}>
            <StandaloneNotice />
            <main className="sf-main">
              <Outlet />
            </main>

            <Footer style={{ textAlign: "center", background: "transparent", padding: "16px 24px 24px", fontSize: 12 }}>
              <Space size={8} wrap style={{ justifyContent: "center" }}>
                <Link onClick={() => setAboutOpen(true)} style={{ fontSize: 12 }}>
                  About
                </Link>
                <Text type="secondary">·</Text>
                <Link onClick={() => setPrivacyOpen(true)} style={{ fontSize: 12 }}>
                  Privacy
                </Link>
                <Text type="secondary">·</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  By{" "}
                  <Link href="https://opsette.io" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>
                    Opsette
                  </Link>
                </Text>
              </Space>
            </Footer>
          </Content>
        </Layout>

        <Drawer
          open={drawerOpen}
          placement="left"
          onClose={() => setDrawerOpen(false)}
          title="Library"
          width={280}
          styles={{ body: { padding: 0 } }}
        >
          <FlowSidebar collapsed={false} onNavigate={() => setDrawerOpen(false)} />
        </Drawer>

        <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
        <PrivacyModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      </Layout>

      <ChooserModal
        open={chooserOpen}
        onPick={(type) => {
          setChooserOpen(false);
          createFromType(type);
        }}
        onPickTemplate={(template) => {
          setChooserOpen(false);
          createFromTemplate(template);
        }}
        onClose={() => setChooserOpen(false)}
      />
    </>
  );
}
