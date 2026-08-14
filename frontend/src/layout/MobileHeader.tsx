import React from 'react';
import { Menu } from 'lucide-react';
import { Logo } from '../components/Logo';
interface MobileHeaderProps {
  onOpenMenu: () => void;
}
export const MobileHeader: React.FC<MobileHeaderProps> = ({
  onOpenMenu
}) => <div className="md:hidden bg-bg-surface text-text-primary p-4 flex justify-between items-center sticky top-0 z-30 shadow-md border-b border-border">
    <div className="flex items-center space-x-2">
      <div className="border border-border bg-bg-code p-1.5 rounded">
        <Logo size={20} />
      </div>
      <span className="font-bold text-lg font-mono">StudyCod</span>
    </div>
    <button type="button" onClick={onOpenMenu} className="w-11 h-11 border border-border inline-flex items-center justify-center hover:bg-bg-hover transition-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70" aria-label="Open menu" title="Open menu">
      <Menu size={24} />
    </button>
  </div>;
