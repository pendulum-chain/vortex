// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../test/i18n";
import { Rating } from "./index";

const mocks = vi.hoisted(() => ({ address: undefined as string | undefined }));

vi.mock("../../hooks/useVortexAccount", () => ({
  useVortexAccount: () => ({ address: mocks.address })
}));

const RATING_TITLE = () => i18n.t("components.rating.title");

async function renderRating(address: string | undefined) {
  mocks.address = address;
  await act(async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Rating />
      </QueryClientProvider>
    );
  });
}

describe("Rating", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="modals"></div>';
  });

  it.each([
    ["a lowercase EVM address", "0xd8da6bf26964af9d7eed9e03e53415d37aa96045"],
    ["an EIP-55 checksummed EVM address", "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"]
  ])("prompts for a rating for %s", async (_label, address) => {
    await renderRating(address);
    expect(screen.queryByText(RATING_TITLE())).not.toBeNull();
  });

  it.each([
    ["no connected account", undefined],
    ["a mixed-case EVM address with a bad checksum", "0xd8da6BF26964aF9D7eEd9e03E53415D37aA96045"],
    ["a Substrate address", "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"],
    ["a truncated EVM address", "0xd8da6bf26964af9d7eed9e03e53415d37aa9604"]
  ])("does not prompt for %s", async (_label, address) => {
    await renderRating(address);
    expect(screen.queryByText(RATING_TITLE())).toBeNull();
  });
});
