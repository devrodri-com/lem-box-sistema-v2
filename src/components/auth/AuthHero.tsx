"use client";

import Image from "next/image";

interface AuthHeroProps {
  title?: string;
  description?: string;
}

export default function AuthHero({
  title = "Accedé a tu panel LEM-BOX",
  description = "Entrá para ver tus trackings, cajas y envíos desde tu cuenta centralizada. Todo el flujo logístico, desde Miami hasta Uruguay y Argentina, en un solo lugar.",
}: AuthHeroProps) {
  return (
    <div className="flex flex-col items-center gap-4 md:gap-6">
      <Image
        src="/lem-box-logo.svg"
        alt="LEM-BOX"
        width={480}
        height={160}
        className="w-full max-w-[420px] h-auto"
      />
    </div>
  );
}
