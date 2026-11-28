import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ManualCategoryPicker from "./ManualCategoryPicker";

afterEach(cleanup);

it("shows the seven categories in the design order and opens the chosen category", () => {
  const onSelect = vi.fn();
  render(<ManualCategoryPicker onSelect={onSelect} />);

  const picker = screen.getByRole("group", { name: "בחירת קטגוריה" });
  const buttons = within(picker).getAllByRole("button");
  expect(buttons.map((button) => button.textContent)).toEqual([
    "עבודות בית", "הנדימן", "בייביסיטר", "חיות מחמד", "גינון", "לימודים", "אחר",
  ]);
  fireEvent.click(within(picker).getByRole("button", { name: "חיות מחמד" }));
  expect(onSelect).toHaveBeenCalledOnce();
  expect(onSelect).toHaveBeenCalledWith("pets");
});
