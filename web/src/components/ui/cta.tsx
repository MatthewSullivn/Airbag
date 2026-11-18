// The two call-to-action buttons. The looks are in styles.css (.btn-shiny, .btn-metal): written by hand after the
// Shiny Button and the Metallic Button on 21st.dev (Hyperiux), in plain CSS.
import { cn } from "@/lib/utils";

type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & { small?: boolean };
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { small?: boolean };

/** The main action: dark, with an orange light that travels round its rim. */
export function ShinyLink({ className, small, ...rest }: LinkProps) {
  return <a {...rest} className={cn("btn-shiny", small && "btn-sm", className)} />;
}
export function ShinyButton({ className, small, ...rest }: BtnProps) {
  return <button type="button" {...rest} className={cn("btn-shiny", small && "btn-sm", className)} />;
}
/** The second action: brushed grey metal. */
export function MetalLink({ className, small, ...rest }: LinkProps) {
  return <a {...rest} className={cn("btn-metal", small && "btn-sm", className)} />;
}
export function MetalButton({ className, small, ...rest }: BtnProps) {
  return <button type="button" {...rest} className={cn("btn-metal", small && "btn-sm", className)} />;
}
