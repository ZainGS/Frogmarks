import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class NamingHelperService {
  private adjectives: string[] = [
    'adorable', 'adventurous', 'aggressive', 'agreeable', 'alert', 'alive', 'amused', 'angry', 'fashionable', 'annoying',
    'anxious', 'whimsical', 'ashamed', 'attractive', 'average', 'awful', 'bad', 'beautiful', 'better', 'bewildered',
    'inspired', 'brave', 'bright', 'busy', 'calm', 'careful', 'cautious', 'charming', 'cheerful', 'clumsy', 'comfortable',
    'concerned', 'confused', 'cooperative', 'courageous', 'crazy', 'sleepy', 'crowded', 'curious', 'cute', 'dangerous',
    'dark', 'defeated', 'defiant', 'delightful', 'enlightened', 'determined', 'different', 'difficult', 'moody',
    'distinct', 'disco', 'dizzy', 'mellow', 'drab', 'vibrant', 'eager', 'easy', 'elated', 'elegant', 'embarrassed',
    'enchanting', 'encouraging', 'energetic', 'enthusiastic', 'happy', 'evil', 'excited', 'expensive', 'exuberant',
    'fair', 'faithful', 'famous', 'fancy', 'fantastic', 'fierce', 'filthy', 'fine', 'foolish', 'fragile', 'frail',
    'frantic', 'friendly', 'frightened', 'funny', 'gentle', 'gifted', 'glamorous', 'gleaming', 'glorious', 'good',
    'gorgeous', 'graceful', 'athletic', 'silly', 'grumpy'
  ];

  private colors: string[] = [
    'red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'brown', 'black', 'white', 'gray', 'violet',
    'turquoise', 'magenta', 'cyan', 'lime', 'indigo', 'maroon', 'navy', 'olive', 'teal', 'aqua', 'coral', 'fuchsia',
    'gold', 'ivory', 'khaki', 'lavender', 'mauve', 'mustard', 'peach', 'plum', 'rose', 'salmon', 'sienna', 'tan',
    'wheat', 'amber', 'azure', 'beige', 'bisque', 'blush', 'bronze', 'chocolate', 'copper', 'cream', 'crimson',
    'emerald', 'jade', 'cerulean', 'lemon', 'lilac', 'mint', 'orchid', 'periwinkle', 'ruby', 'saffron', 'scarlet',
    'sepia', 'silver', 'snow', 'tangerine', 'tomato', 'amethyst', 'auburn', 'brass', 'burgundy', 'charcoal', 'claret',
    'clay', 'cobalt', 'denim', 'forest', 'ecru', 'fern', 'flax', 'ginger', 'honey', 'ivory', 'jet', 'linen', 'mahogany',
    'midnight', 'moss', 'ochre', 'onyx', 'opal', 'pearl', 'quartz', 'raspberry', 'sapphire', 'smoke', 'steel',
    'topaz', 'ultramarine'
  ];

  private gemstones: string[] = [
    'agate', 'alexandrite', 'amazonite', 'amber', 'amethyst', 'ammolite', 'andesine', 'apatite', 'aquamarine', 'aventurine',
    'azurite', 'benitoite', 'beryl', 'bloodstone', 'calcite', 'carnelian', 'chalcedony', 'chrysoberyl', 'chrysocolla', 'chrysoprase',
    'citrine', 'coral', 'diamond', 'diopside', 'dolomite', 'dumortierite', 'emerald', 'fluorite', 'garnet', 'goshenite',
    'heliodor', 'hematite', 'howlite', 'iolite', 'jade', 'jasper', 'jet', 'kunzite', 'kyanite', 'labradorite',
    'lapis lazuli', 'larimar', 'lepidolite', 'magnesite', 'malachite', 'moldavite', 'moonstone', 'morganite', 'obsidian', 'onyx',
    'opal', 'peridot', 'pietersite', 'prehnite', 'pyrite', 'quartz', 'rhodochrosite', 'rhodonite', 'rose quartz', 'ruby',
    'sapphire', 'selenite', 'serpentine', 'spinel', 'sphalerite', 'spodumene', 'staurolite', 'sugilite', 'sunstone', 'tanzanite',
    'tiger\'s eye', 'topaz', 'tourmaline', 'turquoise', 'unakite', 'variscite', 'wulfenite', 'zircon', 'zoisite', 'zultanite',
    'agate', 'alexandrite', 'amazonite', 'amber', 'amethyst', 'ammolite', 'andesine', 'apatite', 'aquamarine', 'aventurine',
    'azurite', 'benitoite', 'beryl', 'bloodstone', 'calcite', 'carnelian', 'chalcedony', 'chrysoberyl', 'chrysocolla', 'chrysoprase'
  ];

  constructor() { }

  getRandomAdjective(): string {
    const index = Math.floor(Math.random() * this.adjectives.length);
    return this.capitalizeFirstLetter(this.adjectives[index]);
  }

  getRandomColorName(): string {
    const index = Math.floor(Math.random() * this.colors.length);
    return this.capitalizeFirstLetter(this.colors[index]);
  }

  getRandomGemstone(): string {
    const index = Math.floor(Math.random() * this.gemstones.length);
    return this.capitalizeFirstLetter(this.gemstones[index]);
  }

  capitalizeFirstLetter(value: string): string {
    if (!value) return value;
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
