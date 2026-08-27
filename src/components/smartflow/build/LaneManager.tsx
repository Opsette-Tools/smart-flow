import { useState, type Dispatch, type KeyboardEvent } from "react";
import { Button, Input } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { Action } from "../store";
import { haptic } from "@/lib/haptics";

interface Props {
  dispatch: Dispatch<Action>;
}

/**
 * Just the add-a-lane control. The chip row that used to live here showed every
 * lane a second time, with a second name, a second rename, and a second delete,
 * directly above the columns that already had all three. Rename, reorder, and
 * delete now live on the lane's own column head.
 */
export function LaneAddBar({ dispatch }: Props) {
  const [newName, setNewName] = useState("");

  // "Sales, Product, Ops" or one name + Enter — comma-split so a paste adds many.
  const addLanes = () => {
    const names = newName.split(",").map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return;
    for (const name of names) dispatch({ type: "ADD_LANE", name });
    haptic("tap");
    setNewName("");
  };

  const onAddKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") addLanes();
  };

  return (
    <div className="sf-lane-add">
      <Input
        placeholder="Add a lane, comma-separate for several"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        onKeyDown={onAddKey}
        allowClear
      />
      <Button type="primary" icon={<PlusOutlined />} onClick={addLanes}>
        Add lane
      </Button>
    </div>
  );
}
