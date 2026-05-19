import { Button } from '@/components/ui/Button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export default function DesignSystemPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto py-10 space-y-12">
        <section>
          <h1 className="text-4xl font-bold mb-6 font-heading">
            Design System
          </h1>
          <p className="text-lg text-gray-600 mb-8 max-w-2xl">
            This page verifies the implementation of design tokens, typography,
            and base components.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold border-b pb-2">Colors</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-md bg-primary text-secondary">
              <span className="font-bold">Primary</span>
              <br />
              #000000
            </div>
            <div className="p-4 rounded-md bg-secondary text-primary border">
              <span className="font-bold">Secondary</span>
              <br />
              #FFFFFF
            </div>
            <div className="p-4 rounded-md bg-accent text-primary">
              <span className="font-bold">Accent</span>
              <br />
              #00FF41
            </div>
            <div className="p-4 rounded-md bg-gray-100 text-gray-900">
              <span className="font-bold">Muted</span>
              <br />
              Gray 100
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold border-b pb-2">Typography</h2>
          <div className="space-y-4">
            <div>
              <h1 className="text-4xl font-bold font-heading">
                Heading 1 (Inter)
              </h1>
              <p className="text-sm text-gray-500">font-heading / 4xl / bold</p>
            </div>
            <div>
              <h2 className="text-2xl font-semibold font-heading">
                Heading 2 (Inter)
              </h2>
              <p className="text-sm text-gray-500">
                font-heading / 2xl / semibold
              </p>
            </div>
            <div>
              <p className="text-base font-body">
                Body text (Roboto). Lorem ipsum dolor sit amet, consectetur
                adipiscing elit. Sed do eiusmod tempor incididunt ut labore et
                dolore magna aliqua.
              </p>
              <p className="text-sm text-gray-500">font-body / base</p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold border-b pb-2">Buttons</h2>
          <div className="flex flex-wrap gap-4">
            <Button variant="primary">Primary Button</Button>
            <Button variant="secondary">Secondary Button</Button>
            <Button variant="accent">Accent Button</Button>
            <Button variant="outline">Outline Button</Button>
            <Button variant="primary" size="sm">
              Small
            </Button>
            <Button variant="primary" size="lg">
              Large
            </Button>
            <Button disabled>Disabled</Button>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold border-b pb-2">Inputs</h2>
          <div className="grid max-w-sm gap-4">
            <Input placeholder="Default Input" />
            <Input
              label="Email Address"
              placeholder="hello@example.com"
              type="email"
            />
            <Input
              label="With Error"
              placeholder="Invalid input"
              error="This field is required"
            />
            <Input disabled placeholder="Disabled input" />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold border-b pb-2">Cards</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Product Card</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">
                  This is a standard card component used for product listings.
                </p>
              </CardContent>
              <CardFooter>
                <Button className="w-full">Add to Cart</Button>
              </CardFooter>
            </Card>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
