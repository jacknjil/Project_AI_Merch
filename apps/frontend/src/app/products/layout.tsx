export const dynamic = 'force-dynamic';

export default function ProductsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black">
      {/* This allows the sub-pages like /products/123 to show up */}
      {children}
    </div>
  );
}
