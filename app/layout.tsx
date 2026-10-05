export const metadata = {
  title: "YesWeHack MCP Server",
  description: "ChatGPT-compatible remote MCP server for YesWeHack",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
