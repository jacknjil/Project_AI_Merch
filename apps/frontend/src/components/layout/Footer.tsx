export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-gray-50">
      <div className="container mx-auto px-4 py-12 md:py-16">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2">
            <h3 className="mb-4 text-lg font-bold font-heading">AI MERCH</h3>
            <p className="text-sm text-gray-500 max-w-xs">
              Premium apparel designed by artificial intelligence. 
              Wear the future.
            </p>
          </div>
          <div>
            <h4 className="mb-4 text-sm font-semibold">Shop</h4>
            <ul className="space-y-2 text-sm text-gray-500">
              <li><a href="#" className="hover:text-primary">New Arrivals</a></li>
              <li><a href="#" className="hover:text-primary">Best Sellers</a></li>
              <li><a href="#" className="hover:text-primary">Accessories</a></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-4 text-sm font-semibold">Support</h4>
            <ul className="space-y-2 text-sm text-gray-500">
              <li><a href="#" className="hover:text-primary">FAQ</a></li>
              <li><a href="#" className="hover:text-primary">Shipping</a></li>
              <li><a href="#" className="hover:text-primary">Returns</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-gray-200 pt-8 md:flex-row">
          <p className="text-xs text-gray-500">
            © {new Date().getFullYear()} AI Merch Store. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
