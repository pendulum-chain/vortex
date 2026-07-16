// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import { FormProvider } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RampFormValues } from "../../../hooks/ramp/schema";
import { useRampForm } from "../../../hooks/ramp/useRampForm";
import { useQuoteStore } from "../../../stores/quote/useQuoteStore";
import { useRampDirectionStore } from "../../../stores/rampDirectionStore";
import { buildQuoteResponse } from "../../../test/fixtures";
import "../../../test/i18n";
import { AveniaKycEligibilityFields } from "./index";

const VALID_CPF = "529.982.247-25";
const VALID_EVM_ADDRESS = "0x1111111111111111111111111111111111111111";

function Harness({ onValid }: { onValid: (values: RampFormValues) => void }) {
  const { form } = useRampForm({ fiatToken: FiatToken.BRL });

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onValid)}>
        <AveniaKycEligibilityFields />
        <button type="submit">Confirm</button>
      </form>
    </FormProvider>
  );
}

describe("AveniaKycEligibilityFields (BRL details form)", () => {
  beforeEach(() => {
    localStorage.clear();
    useQuoteStore.setState({ quote: undefined });
    useRampDirectionStore.setState({ activeDirection: RampDirection.SELL });
  });

  describe("offramp (SELL)", () => {
    it("renders CPF/CNPJ and Pix key fields", () => {
      render(<Harness onValid={vi.fn()} />);

      expect(screen.getByLabelText("CPF or CNPJ")).toBeInTheDocument();
      expect(screen.getByLabelText("Pix key")).toBeInTheDocument();
    });

    it("shows required errors and does not submit when both fields are empty", async () => {
      const onValid = vi.fn();
      const user = userEvent.setup();
      render(<Harness onValid={onValid} />);

      await user.click(screen.getByRole("button", { name: "Confirm" }));

      expect(await screen.findByText("CPF or CNPJ is required when transferring BRL")).toBeInTheDocument();
      expect(screen.getByText("PIX key is required when transferring BRL")).toBeInTheDocument();
      expect(onValid).not.toHaveBeenCalled();
    });

    it("rejects a malformed CPF", async () => {
      const onValid = vi.fn();
      const user = userEvent.setup();
      render(<Harness onValid={onValid} />);

      await user.type(screen.getByLabelText("CPF or CNPJ"), "12345");
      await user.type(screen.getByLabelText("Pix key"), "user@example.com");
      await user.click(screen.getByRole("button", { name: "Confirm" }));

      expect(await screen.findByText("Invalid CPF or CNPJ format")).toBeInTheDocument();
      expect(onValid).not.toHaveBeenCalled();
    });

    it("rejects a Pix key that matches no valid format", async () => {
      const onValid = vi.fn();
      const user = userEvent.setup();
      render(<Harness onValid={onValid} />);

      await user.type(screen.getByLabelText("CPF or CNPJ"), VALID_CPF);
      await user.type(screen.getByLabelText("Pix key"), "not-a-pix-key");
      await user.click(screen.getByRole("button", { name: "Confirm" }));

      expect(await screen.findByText("PIX key does not match any of the valid formats")).toBeInTheDocument();
      expect(onValid).not.toHaveBeenCalled();
    });

    it("submits with a valid CPF and an email Pix key", async () => {
      const onValid = vi.fn();
      const user = userEvent.setup();
      render(<Harness onValid={onValid} />);

      await user.type(screen.getByLabelText("CPF or CNPJ"), VALID_CPF);
      await user.type(screen.getByLabelText("Pix key"), "user@example.com");
      await user.click(screen.getByRole("button", { name: "Confirm" }));

      await waitFor(() => expect(onValid).toHaveBeenCalledTimes(1));
      expect(onValid.mock.calls[0][0]).toMatchObject({
        fiatToken: FiatToken.BRL,
        pixId: "user@example.com",
        taxId: VALID_CPF
      });
    });
  });

  describe("onramp (BUY)", () => {
    beforeEach(() => {
      useRampDirectionStore.setState({ activeDirection: RampDirection.BUY });
      // An EVM-destination BUY quote makes the schema require a valid EVM wallet address.
      useQuoteStore.setState({ quote: buildQuoteResponse({ rampType: RampDirection.BUY, to: Networks.Base }) });
    });

    it("renders a wallet address field instead of the Pix key and rejects invalid EVM addresses", async () => {
      const onValid = vi.fn();
      const user = userEvent.setup();
      render(<Harness onValid={onValid} />);

      expect(screen.queryByLabelText("Pix key")).not.toBeInTheDocument();

      await user.type(screen.getByLabelText("CPF or CNPJ"), VALID_CPF);
      await user.type(screen.getByLabelText("Wallet Address"), "0x123-not-an-address");
      await user.click(screen.getByRole("button", { name: "Confirm" }));

      expect(await screen.findByText("Invalid EVM wallet address")).toBeInTheDocument();
      expect(onValid).not.toHaveBeenCalled();
    });

    it("submits with a valid CPF and EVM wallet address", async () => {
      const onValid = vi.fn();
      const user = userEvent.setup();
      render(<Harness onValid={onValid} />);

      await user.type(screen.getByLabelText("CPF or CNPJ"), VALID_CPF);
      await user.type(screen.getByLabelText("Wallet Address"), VALID_EVM_ADDRESS);
      await user.click(screen.getByRole("button", { name: "Confirm" }));

      await waitFor(() => expect(onValid).toHaveBeenCalledTimes(1));
      expect(onValid.mock.calls[0][0]).toMatchObject({
        taxId: VALID_CPF,
        walletAddress: VALID_EVM_ADDRESS
      });
    });
  });
});
