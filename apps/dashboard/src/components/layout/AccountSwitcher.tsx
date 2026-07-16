import { Building2, User } from "lucide-react";
import { useActiveAccount } from "@/hooks/useActiveAccount";

/** The authenticated sender account. One session = one account, so there's nothing to switch. */
export function AccountSwitcher() {
  const account = useActiveAccount();

  if (!account) {
    return null;
  }

  return (
    <div className="flex h-9 items-center gap-2 rounded-md border px-2.5">
      {account.type === "company" ? (
        <Building2 className="size-4 text-muted-foreground" />
      ) : (
        <User className="size-4 text-muted-foreground" />
      )}
      <span className="max-w-[14rem] truncate font-medium text-sm">{account.name}</span>
    </div>
  );
}
