import { ExclamationTriangleIcon, InformationCircleIcon, XCircleIcon } from "@heroicons/react/24/solid";
import type { Meta, StoryObj } from "@storybook/react";
import { AlertBanner } from "../components/AlertBanner";

const meta: Meta<typeof AlertBanner> = {
  component: AlertBanner,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  title: "Components/AlertBanner"
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <AlertBanner
      description="Please review the details before proceeding."
      icon={<ExclamationTriangleIcon className="h-5 w-5 text-yellow-600" />}
      title="Warning"
    />
  )
};

export const TitleOnly: Story = {
  render: () => <AlertBanner icon={<ExclamationTriangleIcon className="h-5 w-5 text-yellow-600" />} title="Action required" />
};

export const WithInfoIcon: Story = {
  render: () => (
    <AlertBanner
      description="Your account verification is pending. This may take up to 24 hours."
      icon={<InformationCircleIcon className="h-5 w-5 text-blue-500" />}
      title="Verification in progress"
    />
  )
};

export const WithErrorIcon: Story = {
  render: () => (
    <AlertBanner
      description="Something went wrong. Please try again or contact support."
      icon={<XCircleIcon className="h-5 w-5 text-red-500" />}
      title="Error occurred"
    />
  )
};

export const WithChildren: Story = {
  render: () => (
    <AlertBanner
      description="Your KYC session has expired."
      icon={<ExclamationTriangleIcon className="h-5 w-5 text-yellow-600" />}
      title="Session expired"
    >
      <button className="btn-vortex-primary btn mt-3 w-full">Restart verification</button>
    </AlertBanner>
  )
};
