import { useMemo, useState, type Dispatch } from "react";
import { Button, Collapse, Empty, Modal, Tag, Typography, message } from "antd";
import { CopyOutlined, ReloadOutlined } from "@ant-design/icons";
import type { SmartFlowDoc } from "../types";
import type { Action } from "../store";
import { haptic } from "@/lib/haptics";
import {
  buildSummary,
  computeGaps,
  handoffContext,
  handoffSentence,
  type HandoffFinding,
} from "./gaps";
import { SummaryEditor } from "./SummaryEditor";

const { Text } = Typography;

interface Props {
  doc: SmartFlowDoc;
  dispatch: Dispatch<Action>;
}

/** A section header: what it is, plus its count. */
function head(label: string, count: number, tone?: "finding" | "todo") {
  return (
    <div className="sf-gap-head">
      <span>{label}</span>
      <Tag
        className="sf-gap-count"
        color={count === 0 ? undefined : tone === "finding" ? "gold" : undefined}
      >
        {count}
      </Tag>
    </div>
  );
}

/** One finding, written as a sentence with its context underneath. */
function Finding({ sentence, context }: { sentence: string; context?: string }) {
  return (
    <li className="sf-finding">
      <span className="sf-finding-say">{sentence}</span>
      {context && <span className="sf-finding-why">{context}</span>}
    </li>
  );
}

/** Handoffs grouped under the lane they belong to. Cross-lane handoffs
 *  get their own group — they belong to two lanes, so filing them under one
 *  would hide them from the other. */
function groupByLane(handoffs: HandoffFinding[]): { name: string; items: HandoffFinding[] }[] {
  const within = new Map<string, HandoffFinding[]>();
  const crossing: HandoffFinding[] = [];
  for (const h of handoffs) {
    if (h.crossLane) {
      crossing.push(h);
      continue;
    }
    const list = within.get(h.fromLane) ?? [];
    list.push(h);
    within.set(h.fromLane, list);
  }
  const groups = [...within.entries()].map(([name, items]) => ({ name, items }));
  // Cross-lane first: a handoff between teams is where work actually gets lost.
  return crossing.length > 0 ? [{ name: "Between lanes", items: crossing }, ...groups] : groups;
}

export function GapsPanel({ doc, dispatch }: Props) {
  const gaps = useMemo(() => computeGaps(doc), [doc]);

  if (gaps.placedCount === 0) {
    return (
      <section className="sf-gaps">
        <div className="sf-section-head">
          <h2 className="sf-section-title">Findings</h2>
        </div>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Place some steps in lanes and the findings show up here."
        />
      </section>
    );
  }

  const handoffGroups = groupByLane(gaps.answeredHandoffs);
  const manualCount = gaps.manualHandoffs.length;

  const items = [
    {
      key: "handoffs",
      label: head("Handoffs", gaps.answeredHandoffs.length, "finding"),
      children:
        gaps.answeredHandoffs.length === 0 ? (
          <Text type="secondary">
Set a handoff method on an arrow and every handoff collects here.
          </Text>
        ) : (
          <>
            <Text type="secondary" className="sf-gap-intro">
              Every handoff with a method set.
              {manualCount > 0 && (
                <>
                  {" "}
                  {manualCount} of {gaps.answeredHandoffs.length}{" "}
                  {manualCount === 1 ? "moves" : "move"} by hand.
                </>
              )}
            </Text>
            <div className="sf-gap-groups">
              {handoffGroups.map((group) => (
                <div key={group.name}>
                  <div className="sf-gap-group-name">{group.name}</div>
                  <ul className="sf-gap-list">
                    {group.items.map((h) => (
                      <Finding
                        key={`${h.fromId}->${h.toId}`}
                        sentence={handoffSentence(h)}
                        context={handoffContext(h)}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        ),
    },
    {
      key: "questions",
      label: head("Outstanding questions", gaps.openQuestionCount, "finding"),
      children:
        gaps.openQuestionCount === 0 ? (
          <Text type="secondary">
Nothing marked yet.
          </Text>
        ) : (
          <>
            <Text type="secondary" className="sf-gap-intro">
Steps carrying an unanswered question.
            </Text>
            <div className="sf-gap-groups">
              {gaps.openQuestions.map((group) => (
                <div key={group.laneId}>
                  <div className="sf-gap-group-name">{group.laneName}</div>
                  <ul className="sf-gap-list">
                    {group.items.map((q) => (
                      <Finding
                        key={q.itemId}
                        sentence={`${q.label} — ${q.question}`}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        ),
    },
    {
      key: "nowhere",
      label: head("Steps with no record", gaps.recordedNowhere.length, "finding"),
      children:
        gaps.recordedNowhere.length === 0 ? (
          <Text type="secondary">
No step names nowhere as its storage system.
          </Text>
        ) : (
          <>
            <Text type="secondary" className="sf-gap-intro">
Nothing keeps a record of these steps.
            </Text>
            <ul className="sf-gap-list">
              {gaps.recordedNowhere.map((s) => (
                <Finding
                  key={s.itemId}
                  sentence={`${s.label} in ${s.laneName} keeps no record.`}
                />
              ))}
            </ul>
          </>
        ),
    },
    {
      key: "systems",
      label: head("Systems in use", gaps.systemInventory.length),
      children:
        gaps.systemInventory.length === 0 ? (
          <Text type="secondary">
No systems named yet.
          </Text>
        ) : (
          <>
            <Text type="secondary" className="sf-gap-intro">
Every system named across the lanes, and how many steps each one holds.
            </Text>
            <ul className="sf-gap-list">
              {gaps.systemInventory.map((s) => (
                <Finding
                  key={s.name}
                  sentence={`${s.name} holds ${s.count} step${s.count === 1 ? "" : "s"}.`}
                />
              ))}
            </ul>
          </>
        ),
    },
    {
      key: "orphans",
      label: head("Steps with no connections", gaps.orphans.length, "finding"),
      children:
        gaps.orphans.length === 0 ? (
          <Text type="secondary">Every step connects to something.</Text>
        ) : (
          <>
            <Text type="secondary" className="sf-gap-intro">
No step leads to these, and these lead nowhere.
            </Text>
            <ul className="sf-gap-list">
              {gaps.orphans.map((o) => (
                <Finding
                  key={o.itemId}
                  sentence={`${o.label} in ${o.laneName} has no step before or after.`}
                />
              ))}
            </ul>
          </>
        ),
    },
    {
      key: "lane-edges",
      label: head("Where lanes connect", gaps.laneEdges.length),
      children: (
        <>
          <Text type="secondary" className="sf-gap-intro">
These are the points where one lane depends on another.
          </Text>
          <div className="sf-gap-groups">
            {gaps.laneEdges.map((lane) => (
              <div key={lane.laneId}>
                <div className="sf-gap-group-name">{lane.laneName}</div>
                {lane.entries.length === 0 && lane.exits.length === 0 ? (
                  <Text type="secondary" style={{ fontSize: "var(--ops-fs-fine)" }}>
No step crosses into this lane or out of it.
                  </Text>
                ) : (
                  <ul className="sf-gap-list">
                    {lane.entries.map((e) => (
                      <Finding
                        key={`in-${e.itemId}-${e.fromLane}`}
                        sentence={`${e.label} receives work from ${e.fromLane}.`}
                      />
                    ))}
                    {lane.exits.map((e) => (
                      <Finding
                        key={`out-${e.itemId}-${e.toLane}`}
                        sentence={`${e.label} sends work to ${e.toLane}.`}
                      />
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </>
      ),
    },
  ];

  // --- Your to-do list: gaps in the INTERVIEW, not in their process. ---------
  // Kept visually separate and last, because conflating "I haven't asked yet"
  // with "the client has a problem" would put your own blank form fields in
  // front of a client as findings.
  const todos = [
    {
      key: "unasked-handoffs",
      label: head("Handoffs with no method", gaps.unaskedHandoffs.length, "todo"),
      children:
        gaps.unaskedHandoffs.length === 0 ? (
          <Text type="secondary">Every handoff has a method.</Text>
        ) : (
          <>
            <Text type="secondary" className="sf-gap-intro">
These arrows have no handoff method set.
            </Text>
            <ul className="sf-gap-list">
              {gaps.unaskedHandoffs.map((h, idx) => (
                <Finding
                  key={`${h.fromLabel}->${h.toLabel}-${idx}`}
                  sentence={`${h.fromLabel} → ${h.toLabel}`}
                />
              ))}
            </ul>
          </>
        ),
    },
    {
      key: "system-not-asked",
      label: head("Steps with no storage system", gaps.systemNotAsked.length, "todo"),
      children:
        gaps.systemNotAsked.length === 0 ? (
          <Text type="secondary">Every step names a storage system.</Text>
        ) : (
          <>
            <Text type="secondary" className="sf-gap-intro">
Blank just means you haven&apos;t filled it in yet.
            </Text>
            <ul className="sf-gap-list">
              {gaps.systemNotAsked.map((s) => (
                <Finding
                  key={s.itemId}
                  sentence={`${s.label} — ${s.laneName}`}
                />
              ))}
            </ul>
          </>
        ),
    },
  ];

  return (
    <section className="sf-gaps">
      <div className="sf-section-head">
        <h2 className="sf-section-title">Findings</h2>

      </div>
      <Collapse items={items} defaultActiveKey={["handoffs"]} className="sf-gaps-collapse" />

      <SummaryBlock doc={doc} dispatch={dispatch} />

      <div className="sf-gaps-todo">
        <div className="sf-section-head">
          <h3 className="sf-section-title sf-gaps-todo-title">Not filled in yet</h3>

        </div>
        <Collapse items={todos} className="sf-gaps-collapse" />
      </div>
    </section>
  );
}

/**
 * The written summary. Generated from the findings, then yours to edit — once
 * text exists, only an explicit Regenerate overwrites it, so nothing you typed
 * disappears on its own when the board changes.
 */
function SummaryBlock({ doc, dispatch }: { doc: SmartFlowDoc; dispatch: Dispatch<Action> }) {
  const [busy, setBusy] = useState(false);
  const text = doc.summary ?? "";

  const generate = () => {
    const next = buildSummary(doc);
    if (!next) {
      message.info("Nothing to summarize yet.");
      return;
    }
    dispatch({ type: "SET_SUMMARY", text: next });
    haptic("success");
  };

  const handleGenerate = () => {
    if (text.trim()) {
      Modal.confirm({
        title: "Replace the summary?",
        content: "This overwrites what's in the box, including your edits.",
        okText: "Regenerate",
        cancelText: "Cancel",
        onOk: generate,
      });
    } else {
      generate();
    }
  };

  const copy = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      // Both flavors: HTML so bold and bullets survive a paste into Monday,
      // Notion, Docs, or an email; plain text for anywhere that only takes it.
      const plain = htmlToPlainText(text);
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([text], { type: "text/html" }),
            "text/plain": new Blob([plain], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      haptic("success");
      message.success("Summary copied");
    } catch {
      message.error("Couldn't copy. Select the text and copy it manually.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sf-summary">
      <div className="sf-section-head">
        <h3 className="sf-section-title sf-gaps-todo-title">Summary</h3>
        <div className="sf-summary-actions">
          <Button size="small" icon={<ReloadOutlined />} onClick={handleGenerate}>
            {text.trim() ? "Regenerate" : "Generate"}
          </Button>
          <Button
            size="small"
            icon={<CopyOutlined />}
            onClick={copy}
            loading={busy}
            disabled={!text.trim()}
          >
            Copy
          </Button>
        </div>
      </div>
      <SummaryEditor
        value={text}
        onChange={(html) => dispatch({ type: "SET_SUMMARY", text: html })}
        placeholder="Generate a written version of everything above, then edit it however you want."
      />
    </div>
  );
}

/** Flatten the summary HTML for clipboard targets that only accept plain text.
 *  Parsed rather than regex-stripped so entities come back as real characters. */
function htmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const lines: string[] = [];
  doc.body.childNodes.forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "UL" || node.tagName === "OL") {
      node.querySelectorAll("li").forEach((li) => lines.push(`- ${li.textContent?.trim() ?? ""}`));
      lines.push("");
    } else {
      const t = node.textContent?.trim();
      if (t) lines.push(t);
    }
  });
  return lines.join("\n").trim();
}
