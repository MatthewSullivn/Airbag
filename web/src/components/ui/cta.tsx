// The two call-to-action buttons. The looks are in styles.css (.btn-shiny, .btn-metal): plain on purpose since
// Nov 20, 2026 (solid safety orange for the main action, an outline for the other). The names stayed so nothing
// that uses them had to change.
import { cn } from "@/lib/utils";

type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & { small?: boolean };
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { small?: boolean };

/** The main action: solid safety orange. */
export function ShinyLink({ className, small, ...rest }: LinkProps) {
  return <a {...rest} className={cn("btn-shiny", small && "btn-sm", className)} />;
}
export function ShinyButton({ className, small, ...rest }: BtnProps) {
  return <button type="button" {...rest} className={cn("btn-shiny", small && "btn-sm", className)} />;
}
/** The second action: an outline in the colour of the text around it. */
export function MetalLink({ className, small, ...rest }: LinkProps) {
  return <a {...rest} className={cn("btn-metal", small && "btn-sm", className)} />;
}
export function MetalButton({ className, small, ...rest }: BtnProps) {
  return <button type="button" {...rest} className={cn("btn-metal", small && "btn-sm", className)} />;
}
