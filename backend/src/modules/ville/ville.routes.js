// Référentiels Ville (lecture seule) exposés au frontend : sites, directions / services — maîtrisés par le Hub DSI.
const router = require('express').Router();
const hub = require('../../services/hubdsi');

router.get('/sites', async (req, res) => res.json(await hub.sites()));
router.get('/directions-services', async (req, res) => res.json(await hub.directionsServices()));

module.exports = router;
