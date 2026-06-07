'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    FileText,
    ChevronRight,
    ChevronDown,
    ShoppingBag,
    TrendingUp,
    DollarSign,
    LayoutGrid,
    Flame,
    Package,
    BarChart3,
    ClipboardList,
    UtensilsCrossed,
    Users,
    Bot,
    XCircle,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

type SubItem = { name: string; href: string; icon: React.ElementType };
type SidebarItem = {
    name: string;
    icon: React.ElementType;
    href?: string;
    subItems?: SubItem[];
};

const sidebarItems: SidebarItem[] = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Asistente IA', href: '/dashboard/agente', icon: Bot },
    {
        name: 'Ventas',
        icon: ShoppingBag,
        subItems: [
            { name: 'Tendencias de Venta', href: '/dashboard/ventas/tendencias', icon: TrendingUp },
            { name: 'Mapa de Calor', href: '/dashboard/ventas/mapadecalor', icon: Flame },
            { name: 'Categorías Global', href: '/dashboard/ventas/categorias-global', icon: LayoutGrid },
            { name: 'Operaciones', href: '/dashboard/ventas/operaciones', icon: ClipboardList },
            { name: 'Reporte Ventas', href: '/dashboard/reportes/ventas', icon: FileText },
            { name: 'Productos Global', href: '/dashboard/ventas/productos-global', icon: Package },
            { name: 'Retiros', href: '/dashboard/ventas/retiros', icon: DollarSign },
            { name: 'Cancelaciones', href: '/dashboard/ventas/cancelaciones', icon: XCircle },
        ]
    },
    {
        name: 'Reportes',
        icon: BarChart3,
        subItems: [
            { name: 'Margen & Rentabilidad', href: '/dashboard/reportes/margen', icon: DollarSign },
        ]
    },
];

interface SidebarProps {
    isCollapsed: boolean;
    setIsCollapsed: (collapsed: boolean) => void;
    isMobileOpen: boolean;
    setIsMobileOpen: (open: boolean) => void;
}

export default function Sidebar({ isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen }: SidebarProps) {
    const pathname = usePathname();
    const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
        'Ventas': pathname.includes('/ventas') || pathname.includes('/reportes'),
        'Reportes': pathname.includes('/reportes'),
    });

    const toggleExpanded = (name: string) => {
        if (isCollapsed) setIsCollapsed(false);
        setExpandedMenus(prev => ({ ...prev, [name]: !prev[name] }));
    };

    useEffect(() => {
        if (isCollapsed) {
            setExpandedMenus({});
        } else {
            setExpandedMenus({
                'Ventas': pathname.includes('/ventas') || pathname.includes('/reportes'),
                'Reportes': pathname.includes('/reportes'),
            });
        }
    }, [isCollapsed, pathname]);

    return (
        <>
            {/* Mobile overlay */}
            {isMobileOpen && (
                <div
                    className="fixed inset-0 z-10 bg-black/50 lg:hidden"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}

            <aside className={cn(
                "fixed left-0 top-16 h-[calc(100vh-4rem)] text-[#3D1C02] transition-all duration-300 z-20 flex flex-col",
                isCollapsed ? "w-20" : "w-64",
                isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
            )}
                style={{
                    background: '#ffffff',
                    borderRight: '1px solid rgba(61, 28, 2, 0.08)',
                    boxShadow: '2px 0 18px rgba(61, 28, 2, 0.05)',
                }}
            >
                {/* Navigation Menu */}
                <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto overflow-x-hidden">
                    {sidebarItems.map((item) => {
                        const hasSubItems = item.subItems && item.subItems.length > 0;
                        const isExpanded = expandedMenus[item.name];
                        const isActive = !hasSubItems && pathname === item.href;
                        const hasActiveChild = hasSubItems && item.subItems!.some(sub => pathname === sub.href);

                        return (
                            <div key={item.name} className="flex flex-col">
                                {hasSubItems ? (
                                    <button
                                        onClick={() => toggleExpanded(item.name)}
                                        className={cn(
                                            "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group w-full text-left cursor-pointer",
                                            hasActiveChild
                                                ? "sidebar-active font-bold"
                                                : "text-[#3D1C02]/70 font-semibold hover:bg-[#EDA60A]/12 hover:text-[#3D1C02]"
                                        )}
                                    >
                                        <item.icon
                                            size={18}
                                            className={cn(
                                                "shrink-0 transition-transform duration-200 group-hover:scale-105",
                                                hasActiveChild ? "text-[#C2662F]" : "text-[#3D1C02]/45"
                                            )}
                                        />
                                        {!isCollapsed && <span className="text-sm flex-1 truncate">{item.name}</span>}
                                        {!isCollapsed && (
                                            isExpanded
                                                ? <ChevronDown size={14} className="shrink-0 opacity-50" />
                                                : <ChevronRight size={14} className="shrink-0 opacity-50" />
                                        )}
                                    </button>
                                ) : (
                                    <Link
                                        href={item.href!}
                                        className={cn(
                                            "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group",
                                            isActive
                                                ? "sidebar-active font-bold"
                                                : "text-[#3D1C02]/70 font-semibold hover:bg-[#EDA60A]/12 hover:text-[#3D1C02]"
                                        )}
                                        title={isCollapsed ? item.name : undefined}
                                        onClick={() => setIsMobileOpen(false)}
                                    >
                                        <item.icon
                                            size={18}
                                            className={cn(
                                                "shrink-0 transition-transform duration-200 group-hover:scale-105",
                                                isActive ? "text-[#C2662F]" : "text-[#3D1C02]/45"
                                            )}
                                        />
                                        {!isCollapsed && <span className="text-sm truncate">{item.name}</span>}
                                    </Link>
                                )}

                                {/* SubItems */}
                                {hasSubItems && !isCollapsed && isExpanded && (
                                    <div className="ml-5 mt-1 flex flex-col gap-0.5 pl-3.5"
                                        style={{ borderLeft: '1px solid rgba(61, 28, 2, 0.15)' }}
                                    >
                                        {item.subItems!.map((sub) => {
                                            const isSubActive = pathname === sub.href;
                                            return (
                                                <Link
                                                    key={sub.name}
                                                    href={sub.href}
                                                    onClick={() => setIsMobileOpen(false)}
                                                    className={cn(
                                                        "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 text-xs group",
                                                        isSubActive
                                                            ? "sidebar-active font-bold"
                                                            : "text-[#3D1C02]/60 font-medium hover:text-[#3D1C02] hover:bg-[#EDA60A]/12"
                                                    )}
                                                >
                                                    <sub.icon
                                                        size={13}
                                                        className={cn(
                                                            "shrink-0",
                                                            isSubActive ? "text-[#C2662F]" : "text-[#3D1C02]/40"
                                                        )}
                                                    />
                                                    <span className="truncate">{sub.name}</span>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </nav>

                {/* Footer - Collapse Toggle */}
                <div className="p-3" style={{ borderTop: '1px solid rgba(61, 28, 2, 0.15)' }}>
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className={cn(
                            "flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-all duration-150 cursor-pointer text-xs font-bold uppercase tracking-wider text-[#3D1C02]/55 hover:text-[#C2662F] hover:bg-[#EDA60A]/12",
                            isCollapsed ? "justify-center" : "justify-between"
                        )}
                        title={isCollapsed ? "Expandir menú" : "Contraer menú"}
                    >
                        <div className="flex items-center gap-3">
                            <ChevronRight size={16} className={cn("transition-transform duration-200", !isCollapsed && "rotate-180")} />
                            {!isCollapsed && <span>Ocultar menú</span>}
                        </div>
                    </button>
                </div>
            </aside>
        </>
    );
}
