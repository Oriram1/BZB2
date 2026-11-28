import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import PageHeader from "./PageHeader";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/components/NavDrawerContext", () => ({ useRegisterHeader: () => {} }));
vi.mock("@/components/MobileNav", () => ({ NavDrawerTrigger: () => <button>תפריט</button> }));
afterEach(cleanup);

it("returns to the previous step when a screen provides its own back action", () => {
  const onBack = vi.fn();
  render(<MemoryRouter><PageHeader variant="figma" centerTitle title="יצירת מטלה חדשה" onBack={onBack} /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "חזרה למסך הקודם" }));
  expect(onBack).toHaveBeenCalledOnce();
});
