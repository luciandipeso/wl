# Remove any vars that might be floating in memory
rm(list=ls())

require(hash)
require(rjson)

## Args
# Defaults
simulation.length <- 72*30
init.pop <- 1
simulation.count <- 10

maturation.interval <- 6*30
gestation.interval <- 3*30
pregnancy.interval <- 0
fertile.interval <- 18*30
impregnation.rate <- .95

cats.die <- FALSE
cat.lifespan <- 24*30

min.litter.size <- 6
max.litter.size <- 6

sex.dist <- "normal"
litter.dist <- "normal"

args <- commandArgs(trailingOnly = TRUE)
if(length(args)) {
  simulation.length <- round(as.numeric(args[1])*30)
  init.pop <- round(as.numeric(args[2]))
  simulation.count <- round(as.numeric(args[3]))
  
  maturation.interval <- round(as.numeric(args[4])*30)
  gestation.interval <- round(as.numeric(args[5])*30)
  pregnancy.interval <- round(as.numeric(args[6]))
  fertile.interval <- round(as.numeric(args[7])*30)
  impregnation.rate <- as.numeric(args[8])
  
  cats.die <- as.logical(args[9])
  cat.lifespan <- round(as.numeric(args[10])*30)
  
  min.litter.size <- round(as.numeric(args[11]))
  max.litter.size <- round(as.numeric(args[12]))
  
  sex.dist <- as.character(args[13])
  litter.dist <- as.character(args[14])
}

print(simulation.length)
print(init.pop)
print(simulation.count)

print(maturation.interval)
print(gestation.interval)
print(pregnancy.interval)
print(fertile.interval)
print(impregnation.rate)

print(cats.die)
print(cat.lifespan)

print(min.litter.size)
print(max.litter.size)

print(sex.dist)
print(litter.dist)

dists <- hash()
dists$uniform <- runif
dists$normal <- rnorm

null.list <- list(average = list())

# Validate inputs
if(simulation.length <= 0) {
  toJSON(null.list)
  quit(save="no")
}

if(init.pop <= 0) {
  init.pop <- 1
}

if(simulation.count <= 0 || simulation.count > 10) {
  simulation.count <- 1
}

if(maturation.interval < 0) {
  maturation.interval <- 0
}
if(gestation.interval < 0) {
  gestation.interval <- 0
}
if(pregnancy.interval < 0) {
  pregnancy.interval <- 0
}
if(fertile.interval < 0) {
  fertile.interval <- 0
}
if(impregnation.rate < 0 || impregnation.rate > 1) {
  impregnation.rate <- 0
}

if(cats.die != TRUE) {
  cats.die <- FALSE
}
if(cat.lifespan < 0) {
  cat.lifespan <- 1
}

if(min.litter.size <= 0 || min.litter.size > max.litter.size) {
  min.litter.size <- 1
  max.litter.size <- 1
}

if(!has.key(sex.dist, dists)) {
  sex.dist <- "uniform"
}

if(!has.key(litter.dist, dists)) {
  litter.dist <- "uniform"
}

pop.df <- data.frame(trial.1 = rep(0, floor(simulation.length/30) + 1))
sex.dist <- dists[[sex.dist]](1000)
sex.dist <- (sex.dist - min(sex.dist))/(max(sex.dist) - min(sex.dist))
litter.dist <- dists[[litter.dist]](1000)
litter.dist <- (litter.dist - min(litter.dist))/(max(litter.dist) - min(litter.dist))

for(k in 1:simulation.count) {  
  ## Initialize population
  pop.size <- c()
  
  cats <- data.frame(
    age = rep(maturation.interval, init.pop), 
    sex = rep("f", init.pop), 
    is.pregnant = rep(TRUE, init.pop), 
    pregnancy.start = rep(0, init.pop), 
    last.littered = rep(0, init.pop),
    stringsAsFactors = FALSE
  )
  
  pop.size <- append(pop.size, nrow(cats))
  
  for(now in 1:simulation.length) {
    cats$age <- cats$age+1
    
    ## Get which cats are having kittens
    # Littering cats are those who are mature, pregnant, and the pregnancy start + gestation interval is >= now
    littering <- which(cats$is.pregnant == TRUE & cats$age >= maturation.interval & cats$pregnancy.start+gestation.interval <= now)
    cats$is.pregnant[littering] <- FALSE
    cats$last.littered[littering] <- now
    
    ## Create new kittens
    litter.size <- 0
    litter.males <- 0
    if(length(littering)) {
      for(j in 1:length(littering)) {
        litter.size <- litter.size + floor((max.litter.size-min.litter.size)*sample(litter.dist, 1, replace=TRUE) + min.litter.size)
        litter.males <- litter.males + floor(sample(sex.dist, 1, replace=TRUE)*litter.size)
      } 
    }
    
    if(litter.size) {
      litter.size <- round(litter.size)
      litter <- data.frame(
        age = rep(0, litter.size),
        sex = rep("f", litter.size),
        is.pregnant = rep(FALSE, litter.size),
        pregnancy.start = rep(simulation.length+10, litter.size),
        last.littered = rep(now, litter.size),
        stringsAsFactors = FALSE
      )
        
      litter$sex[sample(nrow(litter), min(litter.males, nrow(litter)), replace=FALSE)] <- "m"
      cats <- rbind(cats, litter) 
    }
    
    ## Get which cats are becoming pregnant
    impregnated <- which(cats$age >= maturation.interval & cats$is.pregnant == FALSE & cats$sex == "f" & cats$last.littered + pregnancy.interval <= now)
    impregnated <- sample(impregnated, min(floor(length(impregnated)*impregnation.rate), length(impregnated)), replace=FALSE)
    cats$is.pregnant[impregnated] <- TRUE
    cats$pregnancy.start[impregnated] <- now
    
    ## Kill old cats
    if(cats.die) {
      cats <- cats[which(cats$age <= cat.lifespan),]
    }
    
    if(now %% 30 == 0) {
      pop.size <- append(pop.size, nrow(cats)) 
    }
  }
  
  pop.df[[paste0("trial.", k)]] <- pop.size
}

pop.df$avg <- rowMeans(pop.df)

#plot(pop.df$avg)
print(toJSON(as.list(pop.df)))