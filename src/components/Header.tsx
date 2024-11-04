import React from 'react';
import { ChevronLeft } from 'lucide-react';

const Header: React.FC = () => {
  return (
    <header className="bg-white p-4 flex items-center">
      <ChevronLeft className="w-6 h-6 mr-2" />
      <h1 className="text-xl font-semibold">Faceless Videos</h1>
    </header>
  );
};

export default Header;
