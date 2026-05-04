const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = [
  'about.html',
  'admin-login.html',
  'admin-signup.html',
  'checkout-success.html',
  'course-checkout.html',
  'course-detail.html',
  'corse2.html',
  'customercourses.html',
  'course.html',
  'customerhome.html',
  'home.html',
  'login.html',
  'payment.html',
  'product-checkout.html',
  'product.html',
  'seller.html',
  'sign-up .html'
];

for (const name of files) {
  const filePath = path.join(root, name);
  const text = fs.readFileSync(filePath, 'utf8');
  let updated = text;

  if (!text.includes('navbar.css') && updated.includes('</head>')) {
    updated = updated.replace('</head>', '  <link rel="stylesheet" href="navbar.css">\n</head>');
  }

  if (!text.includes('navbar.js') && updated.includes('</body>')) {
    updated = updated.replace('</body>', '  <script src="navbar.js"></script>\n</body>');
  }

  if (updated !== text) {
    fs.writeFileSync(filePath, updated, 'utf8');
    console.log('updated', name);
  }
}
