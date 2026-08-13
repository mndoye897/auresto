# Tester DexPay (Wave et Orange Money)

Le projet utilise le checkout DexPay hébergé. Le client choisit Wave ou Orange
Money sur la page DexPay, puis Auresto crée la commande seulement après le
webhook `checkout.completed` signé.

## Configuration sandbox

Dans `backend/.env` (jamais dans les fichiers frontend ni dans Git), ajoutez :

```env
DEXPAY_MODE=sandbox
DEXPAY_API_KEY=pk_test_votre_nouvelle_cle
DEXPAY_WEBHOOK_SECRET=sk_test_votre_nouvelle_cle
AURESTO_APP_URL=https://votre-frontend.example
DEXPAY_WEBHOOK_URL=https://votre-backend.example/api/payments/dexpay/webhook
```

Les deux URLs doivent être accessibles publiquement en HTTPS pour que DexPay
puisse rediriger le client et appeler le webhook. En développement local,
utilisez l’URL HTTPS de votre déploiement de test ou un tunnel HTTPS.

Appliquez ensuite les migrations et redémarrez le backend :

```powershell
cd backend
npm run migrate
npm start
```

## Parcours de test

1. Ouvrez un menu client relié à un restaurant synchronisé (`?r=<id>`).
2. Ajoutez des plats, choisissez Wave ou Orange Money, puis sélectionnez
   **Continuer vers DexPay**.
3. Le simulateur DexPay s’ouvre en mode sandbox : simulez un paiement réussi,
   échoué ou annulé.
4. Pour un succès, vérifiez qu’un webhook signé arrive sur
   `/api/payments/dexpay/webhook` ; la commande apparaît alors dans Auresto.

Ne considérez jamais la redirection du navigateur comme une preuve de paiement :
le webhook DexPay est la confirmation qui crée la commande.
