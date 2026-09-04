import { useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, Menu, Tooltip, message, type MenuProps } from "antd";
import { ImportOutlined, HomeOutlined, FolderOpenOutlined, SearchOutlined } from "@ant-design/icons";
import { flowsRepo } from "@/db/flowsRepo";
import { discoverySessionsRepo } from "@/db/discoverySessionsRepo";
import { sniffImport } from "@/lib/sniffImport";
import { setActiveFlowId } from "@/lib/activeFlow";
import { setActiveDiscoverySessionId } from "@/lib/activeDiscoverySession";
import { useFlows } from "./FlowsContext";
import { useDiscoverySessions } from "./DiscoveryContext";

const HOME_KEY = "__home__";
const LIBRARY_KEY = "__library__";
const DISCOVERY_KEY = "__discovery__";

interface Props {
  /** True only in the desktop Sider's collapsed (icon-rail) state. The Menu
   *  below collapses itself automatically via Sider's context; the Import
   *  button doesn't, so it needs telling — otherwise its label overflows the
   *  narrow rail. Always false in the mobile Drawer, which never collapses. */
  collapsed: boolean;
  /** Called after any navigation, so the mobile Drawer closes behind it. No-op on desktop. */
  onNavigate: () => void;
}

/**
 * Top-level nav only: Home, Library, and an Import button above them — a
 * temporary, explicitly-called-out placement (2026-08-31: "for now, I'll
 * redesign it later"), not a considered final home for it. Deliberately does
 * NOT list individual flows (2026-08-31: an unbounded scrolling name list
 * with no search isn't real navigation once there are more than a handful —
 * Library is where you browse and open them). Shared content for the
 * desktop Sider and the mobile Drawer, so the two can never drift apart.
 */
export function FlowSidebar({ collapsed, onNavigate }: Props) {
  const { refresh } = useFlows();
  const { refresh: refreshDiscovery } = useDiscoverySessions();
  const location = useLocation();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-importing the same file name later
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const sniffed = sniffImport(reader.result as string);

      if (sniffed.kind === "discovery") {
        const session = await discoverySessionsRepo.create(sniffed.data);
        refreshDiscovery();
        setActiveDiscoverySessionId(session.id);
        navigate(`/discovery/${session.id}`);
        onNavigate();
        message.success(`Imported "${session.name}" into Discovery`);
        return;
      }

      if (sniffed.kind === "unrecognized") {
        message.error("That isn't a SmartFlow export file.");
        return;
      }

      const flow = await flowsRepo.create(sniffed.data);
      refresh();
      setActiveFlowId(flow.id);
      navigate(`/flow/${flow.id}`);
      onNavigate();
      message.success(`Imported "${flow.name}"`);
    };
    reader.readAsText(file);
  };

  const items: MenuProps["items"] = useMemo(
    () => [
      { key: HOME_KEY, icon: <HomeOutlined />, label: "Home" },
      { key: LIBRARY_KEY, icon: <FolderOpenOutlined />, label: "Library" },
      { key: DISCOVERY_KEY, icon: <SearchOutlined />, label: "Discovery" },
    ],
    [],
  );

  const selectedKeys =
    location.pathname === "/"
      ? [HOME_KEY]
      : location.pathname === "/library"
        ? [LIBRARY_KEY]
        : location.pathname.startsWith("/discovery")
          ? [DISCOVERY_KEY]
          : [];

  const handleClick: MenuProps["onClick"] = ({ key }) => {
    navigate(key === HOME_KEY ? "/" : key === DISCOVERY_KEY ? "/discovery" : "/library");
    onNavigate();
  };

  return (
    <>
      <div style={{ padding: collapsed ? "10px 12px" : 12, display: "flex", justifyContent: "center" }}>
        {collapsed ? (
          <Tooltip title="Import flow" placement="right">
            <Button shape="circle" icon={<ImportOutlined />} onClick={handleImportClick} aria-label="Import flow" />
          </Tooltip>
        ) : (
          <Button icon={<ImportOutlined />} block onClick={handleImportClick}>
            Import flow
          </Button>
        )}
        <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleFileChange} style={{ display: "none" }} />
      </div>
      <Menu mode="inline" selectedKeys={selectedKeys} items={items} onClick={handleClick} style={{ border: "none" }} />
    </>
  );
}
