
export const designSystem = {
    colors: {
        primary: '#F9C922', // Brand Yellow
        text: '#000000',    // Black
        background: '#FFFFFF',
        surface: '#F4F5F7', // Light Grey for backgrounds
        green: '#007e6e',   // Brand Green
        blue: '#1E40AF',    // Brand Blue (approximate from image)
        pink: '#FF9E80',    // Brand Pink/Salmon (approximate from image)
        greyLight: '#F1F1F1',
        greyMedium: '#4d4d4d',
        border: '#E5E7EB',
    },
    typography: {
        fontFamily: "'Fredoka', sans-serif",
    },
    borderRadius: {
        card: '24px',
        button: '9999px', // Full rounded (pill)
    },
    shadows: {
        card: '0 2px 4px rgba(0, 0, 0, 0.05)',
        hover: '0 8px 16px rgba(0, 0, 0, 0.1)',
    },
    // Reusable Tailwind classes for consistency
    classes: {
        btnPrimary: "bg-[#F9C922] text-[#000000] font-bold px-4 py-2 rounded-full shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 flex items-center gap-2 text-sm",
        btnSecondary: "bg-white text-[#000000] font-bold px-4 py-2 rounded-full border-2 border-gray-100 hover:border-[#F9C922] transition-all duration-200 flex items-center gap-2 text-sm",
        btnBlue: "bg-[#1E40AF] text-white font-bold px-4 py-2 rounded-full shadow-sm hover:shadow-md hover:bg-[#1E3A8A] transition-all duration-200 hover:-translate-y-0.5 flex items-center gap-2 text-sm",
        btnPink: "bg-[#FF9E80] text-[#000000] font-bold px-4 py-2 rounded-full shadow-sm hover:shadow-md hover:bg-[#FF8A65] transition-all duration-200 hover:-translate-y-0.5 flex items-center gap-2 text-sm",
        btnGreen: "bg-[#007e6e] text-white font-bold px-4 py-2 rounded-full shadow-sm hover:shadow-md hover:bg-[#00695C] transition-all duration-200 hover:-translate-y-0.5 flex items-center gap-2 text-sm",
        btnIcon: "w-10 h-10 flex items-center justify-center rounded-full bg-white border-2 border-gray-100 hover:border-[#F9C922] text-black hover:text-[#000000] transition-all duration-200 shadow-sm",
        card: "bg-white rounded-[24px] shadow-sm border border-gray-100",
        container: "bg-[#F4F5F7] rounded-[32px] border border-gray-200 shadow-inner",
        input: "w-full p-4 rounded-xl border-2 border-gray-200 focus:border-[#F9C922] outline-none transition-colors font-medium bg-gray-50 focus:bg-white text-[#000000]",
    }
};
