import { useEffect, useMemo, useState, type Dispatch } from "react";
import { Button, Empty } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { Action } from "../store";
import type { DiscoveryDoc } from "../types";
import { haptic } from "@/lib/haptics";
import { StepCard } from "./StepCard";
import { StepInspector } from "./StepInspector";
import { ResizableDrawer } from "@/components/common/ResizableDrawer";

interface Props {
  doc: DiscoveryDoc;
  dispatch: Dispatch<Action>;
}

/** The step table itself: a compact card list (fast to scan mid-meeting),
 *  drag-to-reorder, tap a card to open the full field drawer. Mirrors
 *  BuildMode's DndContext but over one flat list — a capture sheet has no
 *  lanes to drop across. */
export function StepListPanel({ doc, dispatch }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const steps = useMemo(() => [...doc.steps].sort((a, b) => a.order - b.order), [doc.steps]);
  const selectedStep = selectedId ? steps.find((s) => s.id === selectedId) ?? null : null;

  useEffect(() => {
    if (selectedId && !steps.some((s) => s.id === selectedId)) setSelectedId(null);
  }, [selectedId, steps]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = steps.map((s) => s.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const next = [...ids];
    next.splice(oldIndex, 1);
    next.splice(newIndex, 0, String(active.id));
    dispatch({ type: "REORDER_STEPS", orderedIds: next });
    haptic("tap");
  };

  const handleAddStep = () => {
    dispatch({ type: "ADD_STEP" });
    haptic("tap");
  };

  return (
    <div className="sf-stack">
      <div className="sf-build-actions">
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddStep}>
          Step
        </Button>
      </div>

      {steps.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No steps yet — add the first one above" style={{ padding: "32px 0" }} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
          <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="sf-outline-list">
              {steps.map((step) => (
                <StepCard
                  key={step.id}
                  step={step}
                  roles={doc.roles}
                  dispatch={dispatch}
                  selected={step.id === selectedId}
                  onSelect={() => setSelectedId(step.id)}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay dropAnimation={null} />
        </DndContext>
      )}

      <ResizableDrawer
        open={selectedStep !== null}
        onClose={() => setSelectedId(null)}
        title={selectedStep ? selectedStep.stepLabel : "Step"}
        storageKey="smart-flow-drawer-w"
      >
        <StepInspector
          step={selectedStep}
          roles={doc.roles}
          systemsList={doc.systemsList}
          dispatch={dispatch}
          onClose={() => setSelectedId(null)}
        />
      </ResizableDrawer>
    </div>
  );
}
