import { XMarkIcon } from "@heroicons/react/24/outline";

interface PageHeaderProps {
  title: string;
  onClose: () => void;
}

export const PageHeader = ({ title, onClose }: PageHeaderProps) => {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <h1 className="font-bold text-3xl">{title}</h1>
      </div>
      <button className="btn-vortex-accent cursor-pointer rounded-full p-2" onClick={onClose} type="button">
        <XMarkIcon className="h-4 w-4" tabIndex={1} />
      </button>
    </div>
  );
};
