/**
 * Generate a complete HTML document from GrapesJS components
 * This is in a separate file to avoid Vue SFC parser issues with HTML tags in strings
 */
export function createHtmlDocument(pageName, htmlContent, css, js) {
  const parts = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '    <meta charset="UTF-8">',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '    <title>' + pageName + '</title>',
    '    <style>',
    css,
    '    </style>',
    '</head>',
    '<body>',
    htmlContent,
    '    <script>',
    js,
    '    </script>',
    '</body>',
    '</html>'
  ];
  
  return parts.join('\n');
}
