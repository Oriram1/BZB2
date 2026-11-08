import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { defaultRangeExtractor, useWindowVirtualizer, type Range } from "@tanstack/react-virtual";
import TaskCard, { type Task } from "./TaskCard";
import { Button } from "@/components/ui/button";

interface Props {
  tasks: Task[];
  saved: Set<string>;
  onToggleSave: (id: string) => void;
}

const VIRTUALIZE_AFTER = 40;
const card = (task: Task, index: number, saved: Set<string>, toggle: (id: string) => void) => (
  <TaskCard key={task.dbId ?? task.id} task={task} index={index}
    saved={task.dbId ? saved.has(task.dbId) : false} onToggleSave={toggle} />
);

function VirtualGrid({ tasks, saved, onToggleSave }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(() => window.matchMedia("(min-width: 768px)").matches ? 2 : 1);
  const [margin, setMargin] = useState(0);
  const [focusedRow, setFocusedRow] = useState<number | null>(null);
  const virtualizer = useWindowVirtualizer({
    count: Math.ceil(tasks.length / columns),
    estimateSize: () => 250,
    gap: 16,
    overscan: 5,
    scrollMargin: margin,
    rangeExtractor: (range: Range) => {
      const visible = defaultRangeExtractor(range);
      if (focusedRow === null || focusedRow >= range.count || visible.includes(focusedRow)) return visible;
      return [...visible, focusedRow].sort((a, b) => a - b);
    },
  });
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setColumns(media.matches ? 2 : 1);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useLayoutEffect(() => {
    const update = () => {
      if (!ref.current) return;
      const top = ref.current.getBoundingClientRect().top + window.scrollY;
      setMargin((current) => Math.abs(current - top) < 1 ? current : top);
    };
    update();
    const observer = new ResizeObserver(update);
    if (ref.current?.parentElement) observer.observe(ref.current.parentElement);
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, [tasks.length, columns]);
  useEffect(() => { virtualizer.measure(); }, [columns, virtualizer]);

  return (
    <div ref={ref} style={{ height: virtualizer.getTotalSize(), position: "relative" }}
      onFocusCapture={(event) => {
        const row = (event.target as HTMLElement).closest<HTMLElement>("[data-index]");
        if (row) setFocusedRow(Number(row.dataset.index));
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusedRow(null);
      }}>
      {virtualizer.getVirtualItems().map((row) => (
        <div key={row.key} data-index={row.index} ref={virtualizer.measureElement}
          className="absolute top-0 left-0 w-full grid grid-cols-1 md:grid-cols-2 gap-4"
          style={{ transform: `translateY(${row.start - margin}px)` }}>
          {tasks.slice(row.index * columns, (row.index + 1) * columns)
            .map((task, column) => card(task, row.index * columns + column, saved, onToggleSave))}
        </div>
      ))}
    </div>
  );
}

export default function TaskGrid(props: Props) {
  const [showAll, setShowAll] = useState(false);
  if (props.tasks.length <= VIRTUALIZE_AFTER) {
    return <div className="grid md:grid-cols-2 gap-4">{props.tasks.map((task, i) => card(task, i, props.saved, props.onToggleSave))}</div>;
  }
  return <>
    <Button type="button" variant="outline" className="mb-4 rounded-full"
      onClick={() => setShowAll((current) => !current)}>
      {showAll ? "הצגת רשימה מותאמת לגלילה" : "הצגת כל המטלות ברצף"}
    </Button>
    {showAll
      ? <div className="grid md:grid-cols-2 gap-4">{props.tasks.map((task, i) => card(task, i, props.saved, props.onToggleSave))}</div>
      : <VirtualGrid {...props} />}
  </>;
}
