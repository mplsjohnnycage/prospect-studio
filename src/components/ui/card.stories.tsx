import type { Meta, StoryObj } from "@storybook/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./card";

const meta = {
  title: "UI/Card",
  component: Card,
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-[320px]">
      <CardHeader>
        <CardTitle>Prospect concept</CardTitle>
        <CardDescription>Loop1 approved surface</CardDescription>
      </CardHeader>
      <CardContent>Screenshoted via Playwright → R2.</CardContent>
    </Card>
  ),
};
