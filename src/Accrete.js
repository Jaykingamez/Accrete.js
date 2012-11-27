function Accrete(stellMass, stellLum) {
	this.stellarMass 		= stellMass || 1;
	this.stellarLuminosity 	= stellLum  || Astro.luminosity(this.stellarMass);
	
	this.innerBound 		= DoleParams.innermostPlanet(this.stellarMass);
	this.outerBound 		= DoleParams.outermostPlanet(this.stellarMass);
	this.innerDust 			= DoleParams.innerDustLimit(this.stellarMass);
	this.outerDust 			= DoleParams.outerDustLimit(this.stellarMass);
}

Accrete.prototype = Object.create({
	criticalMass	: 0,
	dustDensity 	: 0,
	dustHead		: 0,
	planetHead 		: 0,

	distributePlanets: function() {
		var dustLeft 	= true;

		this.dustHead 	= new DustBand(this.innerDust, this.outerDust);
		this.planetHead = null;

		while(dustLeft) {
			// this.log();

			var tismal = Planetismal.randomPlanetismal(this.innerBound, this.outerBound);
			
			this.dustDensity 	= DoleParams.dustDensity(this.stellarMass, tismal.axis);
			this.criticalMass 	= tismal.criticalMass(this.stellarLuminosity);
			
			var mass = this.accreteDust(tismal);
			
			if((mass != 0.0) && (mass != Planetismal.protoplanetMass)) {
			
				if(mass >= this.criticalMass) tismal.gasGiant = true;

				this.updateDustLanes(tismal.innerSweptLimit(), tismal.outerSweptLimit(), tismal.gasGiant);
				// console.log(tismal.innerSweptLimit(), tismal.outerSweptLimit())	
				dustLeft = this.checkDustLeft();
				
				this.compressDustLanes();
				
				if(!this.coalescePlanetismals(tismal)) this.insertPlanet(tismal);
			}
		}

		var planets = [this.planetHead],
			curr 	= this.planetHead;

		while(curr = curr.next) planets.push(curr);

		return planets;
	},

	dustAvailable: function(inside, outside) {
		var curr 		= this.dustHead,
			dustHere 	= false;

		while(curr && curr.outer < inside) curr = curr.next;

		if(!curr) return false;

		if(curr) dustHere = curr.dust;

		while(curr && curr.inner < outside) {
			curr = curr.next;
			dustHere = dustHere || curr.dust;
		}

		return dustHere;
	},

	//	Planetismal : nucleus
	accreteDust: function(nucleus) {
		var newMass = nucleus.mass;

		//	TODO: 	Make sure that turning the original DO/WHILE
		//			into a while didn't affect the outcome
		do {
			nucleus.mass = newMass;
			newMass = 0;
			
			for(var curr = this.dustHead; curr; curr = curr.next) {
				newMass += this.collectDust(nucleus, curr);
			}
		}
		while(newMass - nucleus.mass > 0.0001 * nucleus.mass);

		nucleus.mass = newMass;

		return nucleus.mass;
	},

	collectDust: function(nucleus, band) {
		if(!band) return 0;

		var sweptInner = nucleus.innerSweptLimit(),
			sweptOuter = nucleus.outerSweptLimit();

		if(sweptInner < 0) sweptInner = 0;

		if(band.outer <= sweptInner || band.inner >= sweptOuter) return 0;

		if(!band.dust) return 0;

		var dustDensity = this.dustDensity,
			massDensity = DoleParams.massDensity(dustDensity, this.criticalMass, nucleus.mass),
			density 	= (!band.gas || nucleus.mass < this.criticalMass) ? dustDensity : massDensity,
			sweptWidth 	= sweptOuter - sweptInner,
			outside 	= sweptOuter - band.outer,
			inside 		= band.inner - sweptInner;
		// console.log("COLLECTION...")
		// console.log("Dust Density: " + dustDensity);
		// console.log("Mass Density: " + massDensity);
		// console.log("sweptWidth  : " + sweptWidth);
		// console.log("Outside 	 : " + outside);
		// console.log("Inside 	 : " + inside);	
		if(outside < 0) outside = 0;
		if(inside < 0) 	inside 	= 0;

		var width 	= sweptWidth - outside - inside,
			term1	= 4 * Math.PI * nucleus.axis * nucleus.axis,
			term2 	= (1 - nucleus.eccn * (outside - inside) / sweptWidth),
			volume	= term1 * nucleus.reducedMargin() * width * term2;
		
		return volume * density;
	},

	updateDustLanes: function(min, max, usedGas) {
		for(var curr = this.dustHead; curr; curr = curr.next) {
			var newGas 	= curr.gas && !usedGas,
				first	= null,
				second	= null,
				next 	= curr;
			
			//	Case 1: Wide
			if(curr.inner < min && curr.outer > max) {
				console.log('WIDE')
				first 	= new DustBand(min, max, false, newGas);
				second 	= new DustBand(max, curr.outer, curr.dust, curr.gas);

				first.next = second;
				second.next = curr.next;
				
				curr.next = first;
				curr.outer = min;

				next = second;
			}
			//	Case 2: Out
			else if(curr.inner < max && curr.outer > max) {
				console.log('OUT')
				first = new DustBand(max, curr.outer, curr.dust, curr.gas);

				first.next = curr.next;
				curr.next = first;
				curr.outer = max;
				curr.dust = false;
				curr.gas = newGas;
				next = first;
			}
			// 	Case 3: In
			else if(curr.inner < min && curr.outer > min) {
				console.log('IN')
				first = new DustBand(min, curr.outer, false, newGas);
				first.next = curr.next;
				curr.next = first;
				curr.outer = min;
				next = first;
			}
			//	Case 4: Narrow
			else if(curr.inner >= min && curr.outer <= max) {
				console.log('NARROW')
				curr.dust = false;
				curr.gas = newGas;
				next = curr;
			}
			//	Case 5: Not
			else if(curr.inner > max || curr.outer < min) {
				console.log('NOTHING')
				next = curr;
			}

			//	Why is this doing this???
			curr = next;
		}
	},

	checkDustLeft: function() {
		var dustLeft = false;

		for(var curr = this.dustHead; curr; curr = curr.next) {
			if(curr.dust && 
				curr.outer >= this.innerBound && 
					curr.inner <= this.outerBound) dustLeft = true;
		}
	
		return dustLeft;
	},

	compressDustLanes: function() {
		var next = null;

		for(var curr = this.dustHead; curr; curr = next) {
			next = curr.next;

			if(next && curr.dust === next.dust && curr.gas === next.gas) {
				curr.outer = next.outer;
				curr.next = next.next;
				next = curr;
			} 
		}
	},

	coalescePlanetismals: function(tismal) {
		for(var curr = this.planetHead; curr; curr = curr.next) {

			var dist 	= curr.axis - tismal.axis,
				dist1 	= null,
				dist2 	= null;

			if(dist > 0) {
				dist1 = tismal.outerEffectLimit() - tismal.axis;
				dist2 = curr.axis - curr.innerEffectLimit();
			}
			else {
				dist1 = tismal.axis - tismal.innerEffectLimit();
				dist2 = curr.outerEffectLimit() - curr.axis;
			}

			if(Math.abs(dist) <= dist1 || Math.abs(dist) <= dist1) {
				this.coalesceTwoPlanets(curr, tismal);
				return true;
			}
		}
		
		return false;
	},

	coalesceTwoPlanets: function(a, b) {
		var newMass = a.mass + b.mass,
			newAxis = newMass / ((a.mass / a.axis) + (b.mass / b.axis)),
			term1 	= a.mass * Math.sqrt(a.axis * (1.0 - a.eccn * a.eccn)),
			term2 	= b.mass * Math.sqrt(b.axis * (1.0 - b.eccn * b.eccn)),
			term3 	= (term1 + term2) / (newMass * Math.sqrt(newAxis)),
			term4 	= 1.0 - term3 * term3,
			newEccn = Math.sqrt(Math.abs(term4));

		a.mass = newMass;
		a.axis = newAxis;
		a.eccn = newEccn;
		a.gasGiant = a.gasGiant || b.gasGiant;
	},

	insertPlanet: function(tismal) {
		if(!this.planetHead) {
			this.planetHead = tismal;
		}
		else {
			if(tismal.axis < this.planetHead.axis) {
				tismal.next = this.planetHead;
				this.planetHead = tismal;
			}
			else {
				var prev = this.planetHead,
					curr = this.planetHead.next;

					while(curr && curr.axis < tismal.axis) {
						prev = curr;
						curr = curr.next;
					}

				tismal.next = curr;
				prev.next = tismal;
			}
		}

	},

	log: function() {
		console.log("Stellar mass: " + this.stellarMass);
		console.log("Stellar Luminosity: " + this.stellarLuminosity);
		console.log("Bounds: " + this.innerBound + " " + this.outerBound);
		console.log("Dust: " + this.innerDust + " " + this.outerDust);
	},

	printDusts: function(output) {
		for(var curr = this.dustHead; curr; curr = curr.next) {
			console.log(output);
		}
	},

	printPlanets: function(output, planets) {
		var curr = this.planetHead;

		while(curr && curr.next) {
			curr.print();
			curr = curr.next;
		}
	}
});
