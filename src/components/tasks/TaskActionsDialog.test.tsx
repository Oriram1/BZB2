import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import TaskActionsDialog from "./TaskActionsDialog";

afterEach(cleanup);

it("runs the chosen action only after confirmation", () => {
  const onAction = vi.fn();
  render(<TaskActionsDialog open onOpenChange={vi.fn()} onAction={onAction} paused={false} pauseAvailable />);
  const confirm = screen.getByRole("button", { name: "אישור" });
  expect(confirm).toBeDisabled();
  fireEvent.click(screen.getByRole("radio", { name: "שכפול מטלה" }));
  expect(onAction).not.toHaveBeenCalled();
  fireEvent.click(confirm);
  expect(onAction).toHaveBeenCalledOnce();
  expect(onAction).toHaveBeenCalledWith("duplicate");
});

it("shows resume for a paused task and makes unavailable actions explicit", () => {
  render(<TaskActionsDialog open onOpenChange={vi.fn()} onAction={vi.fn()} paused pauseAvailable={false} />);
  expect(screen.getByRole("radio", { name: /חידוש הפרסום/ })).toBeDisabled();
  expect(screen.getByText("האפשרות עדיין לא זמינה")).toBeInTheDocument();
});

it("moves through available actions with arrow keys", () => {
  render(<TaskActionsDialog open onOpenChange={vi.fn()} onAction={vi.fn()} paused={false} pauseAvailable={false} />);
  const edit = screen.getByRole("radio", { name: "עריכת המטלה" });
  edit.focus();
  fireEvent.keyDown(edit, { key: "ArrowDown" });
  expect(screen.getByRole("radio", { name: "שכפול מטלה" })).toHaveFocus();
  expect(screen.getByRole("radio", { name: "שכפול מטלה" })).toHaveAttribute("aria-checked", "true");
});
